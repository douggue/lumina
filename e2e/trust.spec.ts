import { test, expect } from "@playwright/test";
import { newPage, registerCustomer, staffLogin } from "./helpers";

/** Admin → Trust: sale popup from a WhatsApp sale, "stock is low" (no number), review after delivery → homepage. */
test.describe.configure({ mode: "serial" });

const stamp = Date.now();
const quote = `Kòd la rive touswit ${stamp}`;

test("admin turns on the popup, adds a WhatsApp sale and a low stock alert", async ({ browser }) => {
  const a = await newPage(browser);
  await staffLogin(a);
  await a.goto("/admin/trust");
  const settings = a.locator("form", { hasText: "Popup settings" });
  await settings.locator("label", { hasText: "Free Fire Diamonds" }).locator("input").check();
  await settings.getByRole("button", { name: "Save" }).click();
  await expect(settings.getByText("Saved")).toBeVisible();

  const add = a.locator("form", { hasText: "Add a WhatsApp sale" });
  await add.getByPlaceholder("First name (Jean)").fill("Nadège");
  await add.getByPlaceholder("Last (P.)").fill("Louis");
  await add.locator('select[name="city"]').selectOption("Santo Domingo");
  await add.locator('select[name="productId"]').selectOption({ label: "Free Fire Diamonds" });
  await add.getByRole("button", { name: "Add to the feed" }).click();
  await expect(a.getByRole("cell", { name: "Nadège L." }).first()).toBeVisible();

  await a.goto("/admin/trust?tab=stock");
  const row = a.locator("tr", { hasText: "Free Fire Diamonds" }).first();
  await row.locator('select[name="mode"]').selectOption("on");
  await row.getByRole("button", { name: "Save" }).click();
  await expect(row.getByText("⚠ Stock is running low")).toBeVisible();
});

test("visitor sees the low stock message (no number) and the sale popup", async ({ page }) => {
  await page.goto("/ht/products/free-fire-diamonds");
  await expect(page.getByRole("status").filter({ hasText: "Stòk la ap fini" })).toBeVisible();
  const pop = page.locator(".sale-pop");
  await expect(pop).toBeVisible({ timeout: 20_000 });
  await expect(pop).toContainText("Nadège L.");
  await expect(pop).toContainText("Santo Domingo");
  await expect(pop).toContainText("achte");
  await pop.getByRole("button", { name: "Fèmen" }).click();
  await expect(pop).toHaveCount(0);
});

test("customer reviews a delivered order, admin puts it on the homepage", async ({ browser }) => {
  const c = await newPage(browser);
  await registerCustomer(c, "Kervens Augustin", `kervens.${stamp}@example.com`, "Kliyan-Avi-2026!");
  await c.goto("/ht/products/google-play-gift-card");
  await c.waitForLoadState("networkidle");
  await c.getByRole("button", { name: "Achte kounye a" }).click();
  await c.waitForURL("**/ht/cart");
  await c.getByRole("link", { name: "Peye" }).click();
  await c.waitForURL("**/ht/checkout");
  await c.getByText("MonCash", { exact: true }).first().click();
  await c.getByRole("button", { name: "Pase kòmand lan" }).click();
  await c.waitForURL("**/api/payments/moncash/mock**");
  await c.getByRole("button", { name: "Approve payment" }).click();
  await c.waitForURL("**/ht/account/orders/**");

  await expect(c.getByRole("heading", { name: "Kijan l te ye?" })).toBeVisible();
  await c.getByRole("radio", { name: "5 zetwal" }).click();
  await c.getByLabel("Yon ti mo (si w vle)").fill(quote);
  await c.getByLabel("Vil ou").selectOption("Montréal");
  await c.getByRole("button", { name: "Voye avi a" }).click();
  await expect(c.getByText("Mèsi anpil!")).toBeVisible();

  const a = await newPage(browser);
  await staffLogin(a);
  await a.goto("/admin/trust?tab=reviews");
  const row = a.locator("tr", { hasText: quote });
  await expect(row).toContainText("Kervens A.");
  await expect(row).toContainText("Montréal");
  await row.getByRole("button", { name: "Homepage" }).click();
  await expect(row.getByText("✓ On homepage")).toBeVisible();

  await c.goto("/ht");
  await expect(c.getByText(quote)).toBeVisible();
  await expect(c.getByText("Sa kliyan nou yo di")).toBeVisible();
});
