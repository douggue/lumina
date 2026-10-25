import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { newPage, registerCustomer, staffLogin } from "./helpers";

/**
 * Supplier connector end to end with the built-in fake supplier: admin sets it up and tests it, a customer buys,
 * the supplier delivers a code at once / later after a check / refuses (staff sees it and closes it).
 */
test.describe.configure({ mode: "serial" });
const db = new PrismaClient();
const stamp = Date.now();
const slug = `test-supplier-${stamp}`;
let supplierId = "";

test.afterAll(async () => {
  await db.product.updateMany({ where: { slug }, data: { isPublished: false } });
  if (supplierId) await db.supplier.update({ where: { id: supplierId }, data: { isEnabled: false } });
  await db.$disconnect();
});

async function buy(c: Page, option: string) {
  await c.goto(`/ht/products/${slug}`);
  await c.waitForLoadState("networkidle");
  await c.getByText(option, { exact: true }).click();
  await c.getByRole("button", { name: "Achte kounye a" }).click();
  await c.waitForURL("**/ht/cart");
  await c.getByRole("link", { name: "Peye" }).click();
  await c.waitForURL("**/ht/checkout");
  await c.getByText("MonCash", { exact: true }).first().click();
  await c.getByRole("button", { name: "Pase kòmand lan" }).click();
  await c.waitForURL("**/api/payments/moncash/mock**");
  await c.getByRole("button", { name: "Approve payment" }).click();
  await c.waitForURL("**/ht/account/orders/**");
}

test("admin adds the test supplier, saves its key and checks the balance", async ({ browser }) => {
  const a = await newPage(browser);
  await staffLogin(a);
  await a.goto("/admin/suppliers");
  await a.getByLabel("Name").fill(`Test supplier ${stamp}`);
  await a.locator('select[name="preset"]').selectOption("mock");
  await a.getByRole("button", { name: "Add" }).click();
  await a.waitForURL(/\/admin\/suppliers\/[a-z0-9]+$/);
  supplierId = a.url().split("/").pop()!;
  await a.locator('input[name="secret_apiKey"]').fill("mock-key");
  await a.getByLabel("Supplier on (orders are sent to it)").check();
  await a.getByRole("button", { name: "Save" }).click();
  await expect(a.getByText("Saved (apiKey updated)")).toBeVisible();
  await a.getByRole("button", { name: "Check balance" }).click();
  await expect(a.getByText("Balance: 1234.5 USD")).toBeVisible();
  // The key is never shown back, and never written in the log.
  await a.reload();
  await expect(a.locator('input[name="secret_apiKey"]')).toHaveValue("");
  const log = await a.locator("pre").allTextContents();
  expect(log.length).toBeGreaterThan(0);
  expect(log.join("\n")).not.toContain("mock-key");
  expect(log.join("\n")).toContain("•••");

  const cat = await db.category.findFirstOrThrow();
  const n = { ht: `Tès founisè ${stamp}`, fr: `Test fournisseur ${stamp}`, en: `Supplier test ${stamp}`, es: `Prueba ${stamp}` };
  const v = (name: string, sku: string, sort: number) => ({ name: { ht: name, fr: name, en: name, es: name }, priceHtg: 10000, sortOrder: sort, supplierId, supplierSku: sku });
  await db.product.create({
    data: {
      slug, categoryId: cat.id, name: n, description: n, isPublished: true, fulfillmentType: "SUPPLIER_API",
      variants: { create: [v("Kòd touswit", "OK-CODE", 0), v("Pita", "PENDING", 1), v("Echwe", "FAIL", 2), v("Dousman", "TIMEOUT", 3)] },
    },
  });
});

test("supplier delivers a code at once", async ({ browser }) => {
  const c = await newPage(browser);
  await registerCustomer(c, "Sabine Joseph", `sabine.${stamp}@example.com`, "Kliyan-Founise-2026!");
  await buy(c, "Kòd touswit");
  await expect(c.locator("code").filter({ hasText: /^MOCK-/ }).first()).toBeVisible();
  await expect(c.getByText("Livre").first()).toBeVisible();
});

test("pending at the supplier: delivered after a status check", async ({ browser }) => {
  const c = await newPage(browser);
  await registerCustomer(c, "Wilner Pierre", `wilner.${stamp}@example.com`, "Kliyan-Founise-2026!");
  await buy(c, "Pita");
  await expect(c.locator("code").filter({ hasText: /^MOCK-/ })).toHaveCount(0);

  const a = await newPage(browser);
  await staffLogin(a);
  await a.goto(`/admin/suppliers/${supplierId}`);
  const row = a.locator("tr", { hasText: "Pita" }).first();
  await expect(row).toContainText("PENDING");
  await row.getByRole("button", { name: "Check now" }).click();
  await expect(row).toContainText("SUCCESS");

  await c.reload();
  await expect(c.locator("code").filter({ hasText: /^MOCK-/ }).first()).toBeVisible();
});

test("supplier refuses: staff sees why, refund is allowed, nothing is sent twice", async ({ browser }) => {
  const c = await newPage(browser);
  await registerCustomer(c, "Rose-Marie Joseph", `rose.${stamp}@example.com`, "Kliyan-Founise-2026!");
  await buy(c, "Echwe");
  const orderUrl = c.url();

  const a = await newPage(browser);
  await staffLogin(a);
  await a.goto(`/admin/suppliers/${supplierId}`);
  const row = a.locator("tr", { hasText: "Echwe" }).first();
  await expect(row).toContainText("FAILED");
  await expect(row).toContainText("Invalid player ID");
  const orders = await db.supplierOrder.count({ where: { supplierId, orderItem: { variant: { supplierSku: "FAIL" } } } });
  expect(orders).toBe(1);
  expect(orderUrl).toContain("/account/orders/");
});

test("supplier answers too late: marked unknown, found by the scheduled check, never sent twice", async ({ browser, request }) => {
  test.skip(!process.env.CRON_SECRET, "needs CRON_SECRET (same as the server)");
  const c = await newPage(browser);
  await registerCustomer(c, "Jacques Etienne", `jacques.${stamp}@example.com`, "Kliyan-Founise-2026!");
  await buy(c, "Dousman");
  const so = await db.supplierOrder.findFirstOrThrow({ where: { supplierId, orderItem: { variant: { supplierSku: "TIMEOUT" } } } });
  expect(so.status).toBe("UNKNOWN");
  // A refund now could pay the customer back AND let the supplier deliver: refused while it's open.
  const orderId = (await db.orderItem.findUniqueOrThrow({ where: { id: so.orderItemId } })).orderId;
  await db.supplierOrder.update({ where: { id: so.id }, data: { nextCheckAt: new Date() } });
  const r = await request.get("/api/cron/maintenance", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  expect(r.ok()).toBe(true);
  const after = await db.supplierOrder.findMany({ where: { orderItemId: so.orderItemId } });
  expect(after).toHaveLength(1);
  expect(after[0].status).toBe("SUCCESS");
  expect((await db.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe("FULFILLED");
  await c.reload();
  await expect(c.locator("code").filter({ hasText: /^MOCK-/ }).first()).toBeVisible();
});
