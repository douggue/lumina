import { test, expect } from "@playwright/test";
import { newPage, registerCustomer, staffLogin } from "./helpers";

test.describe.configure({ timeout: 180_000 });

const stamp = Date.now();
const catSlug = `echanj-${stamp}`;
const catName = `Echanj ${stamp % 100000}`;
const slug = `meru-${stamp}`;

test("money exchange: every product in the exchange category gets the rate, fee table and server-side price", async ({ browser }) => {
  const a = await newPage(browser);
  await staffLogin(a);

  // A fresh exchange category, so demo products are untouched
  await a.goto("/admin/products");
  await a.waitForLoadState("networkidle");
  const cat = a.locator("form", { hasText: "New category" });
  await cat.locator('input[name="slug"]').fill(catSlug);
  await cat.locator('input[name="name_ht"]').fill(catName);
  await cat.getByRole("button", { name: "Create" }).click();
  await expect(a.locator(`input[name=slug][value="${catSlug}"]`)).toHaveCount(1);

  // Product in that category: no exchange setting on the product itself
  await a.goto("/admin/products/new");
  await a.waitForLoadState("networkidle");
  await a.locator('input[name="slug"]').fill(slug);
  await a.locator('input[name="name_ht"]').fill("Meru");
  const opt = await a.locator('select[name="categoryId"] option', { hasText: catName }).getAttribute("value");
  await a.locator('select[name="categoryId"]').selectOption(opt!);
  await a.locator('textarea[name="fields"]').fill(JSON.stringify([{ key: "meru", label: { ht: "Imèl, nimewo oswa merutag" }, type: "text", required: true }]));
  await a.getByLabel("Published").check();
  await a.getByRole("button", { name: "Save product" }).click();
  await a.waitForURL(/\/admin\/products\/c/);

  // Shared rules: market 130 + margin 10; $2 up to $40, +$1 every $40, 4% over $400
  await a.goto("/admin/exchange");
  await a.waitForLoadState("networkidle");
  await a.getByLabel("Exchange category").selectOption(opt!);
  await a.getByLabel("Market rate (HTG for 1 USD)").fill("130");
  await a.getByLabel("Your margin (HTG)").fill("10");
  await a.getByRole("button", { name: "Fill" }).click();
  await expect(a.getByTestId("fee-row")).toHaveCount(10);
  await a.getByLabel("Customer wants (USD)").fill("500");
  await expect(a.getByText("$20 (4%)")).toBeVisible();
  await a.getByRole("button", { name: "Save exchange rules" }).click();
  await expect(a.getByRole("status")).toContainText("1 USD = 140 HTG");
  await expect(a.getByRole("link", { name: "Meru" })).toBeVisible();

  const c = await newPage(browser);
  await registerCustomer(c, "Kliyan Meru", `meru.${stamp}@example.com`, "Kliyan-Meru-2026!");
  await c.goto(`/ht/products/${slug}`);
  await expect(c.getByText("1 USD = 140 HTG")).toBeVisible();
  await c.getByLabel("Antre kantite USD").fill("2");
  await c.getByLabel("Imèl, nimewo oswa merutag").fill("jean@example.com");
  await c.getByRole("button", { name: "Achte kounye a" }).click();
  await expect(c.getByText(/Antre yon montan ant/)).toBeVisible();

  await c.getByLabel("Antre kantite USD").fill("30");
  await expect(c.getByText(/\+ 2,00\s\$US frè/)).toBeVisible();
  await expect(c.getByText(/4[\s  ]?480 HTG/).first()).toBeVisible();
  await c.getByRole("button", { name: "Achte kounye a" }).click();
  await c.waitForURL("**/ht/cart");
  await expect(c.getByText(/30,00\s\$US/).first()).toBeVisible();
  await c.getByRole("link", { name: "Peye" }).click();
  await c.waitForURL("**/ht/checkout");
  await c.locator("label", { hasText: "NatCash" }).first().click();
  await c.getByRole("button", { name: "Pase kòmand lan" }).click();
  await c.waitForURL("**/ht/account/orders/**");
  await expect(c.getByText(/4[\s  ]?480/).first()).toBeVisible();

  // Staff see how much to send
  await a.goto(c.url().replace(/.*\/account\/orders\//, "/admin/orders/"));
  await expect(a.getByText("Amount to send (USD):")).toBeVisible();
  await expect(a.getByText("30.00", { exact: true })).toBeVisible();
});
