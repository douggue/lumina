import { test, expect, type Page } from "@playwright/test";
import { staffLogin } from "./helpers";

/**
 * Critical journeys from blueprint §20, run against a seeded database with MonCash in mock mode.
 * Run: npx playwright test   (requires the dev or production server on BASE_URL, default http://localhost:3000)
 */
const stamp = Date.now();
const customer = { name: "Jean Test", email: `jean.${stamp}@example.com`, password: "Kliyan2026!" };
const admin = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@haitigaming.test", password: process.env.E2E_ADMIN_PASSWORD ?? "AdminPassw0rd!2026" };
const natcashRef = `NC${stamp}`.slice(0, 14);

test.describe.configure({ mode: "serial" });

/** Staff sign-in through the shared helper (sets up 2FA the first time and answers security prompts). */
async function adminLogin(page: Page) {
  await staffLogin(page);
}

test("customer registers in Kreyòl and buys a gift card with MonCash", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/ht$/);
  // The headline is editable in Admin → Homepage (another spec changes it), so only check the page is in Kreyòl.
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ht");

  await page.goto("/ht/auth/register");
  await page.getByLabel("Non konplè").fill(customer.name);
  await page.getByLabel("Imèl").fill(customer.email);
  await page.getByLabel("Modpas").fill(customer.password);
  await page.getByRole("button", { name: "Kreye yon kont" }).click();
  await page.waitForURL("**/ht/account");

  await page.goto("/ht/products/google-play-gift-card");
  await page.getByRole("button", { name: "Achte kounye a" }).click();
  await page.waitForURL("**/ht/cart");
  await page.getByRole("link", { name: "Peye" }).click();
  await page.waitForURL("**/ht/checkout");
  await page.getByText("MonCash", { exact: true }).first().click();
  await page.getByRole("button", { name: "Pase kòmand lan" }).click();

  await page.waitForURL("**/api/payments/moncash/mock**");
  await page.getByRole("button", { name: "Approve payment" }).click();
  await page.waitForURL("**/ht/account/orders/**");
  await expect(page.getByText("Livre").first()).toBeVisible();
  await expect(page.locator("code").first()).toContainText("DEMO-");
});

test("customer submits a NatCash deposit", async ({ page }) => {
  await page.goto("/ht/auth/login");
  await page.getByLabel("Imèl").fill(customer.email);
  await page.getByLabel("Modpas").fill(customer.password);
  await page.getByRole("button", { name: "Konekte" }).click();
  await page.waitForURL("**/ht/account");
  await page.goto("/ht/account/wallet/deposit");
  await page.getByRole("tab", { name: /NatCash/ }).click();
  await page.getByLabel("Montan (HTG)").fill("2500");
  await page.getByLabel("Referans tranzaksyon NatCash").fill(natcashRef);
  await page.getByRole("button", { name: "Voye depo a" }).click();
  await expect(page.getByText("Depo a voye")).toBeVisible();

  // The same reference cannot be used twice
  await page.goto("/ht/account/wallet/deposit");
  await page.getByRole("tab", { name: /NatCash/ }).click();
  await page.getByLabel("Montan (HTG)").fill("2500");
  await page.getByLabel("Referans tranzaksyon NatCash").fill(natcashRef);
  await page.getByRole("button", { name: "Voye depo a" }).click();
  await expect(page.getByText("Referans sa a te deja itilize.")).toBeVisible();
});

test("admin sets up 2FA and approves the NatCash deposit", async ({ page }) => {
  await adminLogin(page);
  await page.goto("/admin/payments");
  const card = page.locator(".card", { hasText: natcashRef });
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("row", { name: new RegExp(natcashRef) })).toContainText("SUCCEEDED");
});

test("customer pays a manual top-up from the wallet, admin delivers it", async ({ page, browser }) => {
  await page.goto("/ht/auth/login");
  await page.getByLabel("Imèl").fill(customer.email);
  await page.getByLabel("Modpas").fill(customer.password);
  await page.getByRole("button", { name: "Konekte" }).click();
  await page.waitForURL("**/ht/account");
  await expect(page.getByText("2 500 HTG").first()).toBeVisible();

  await page.goto("/ht/products/free-fire-diamonds");
  await page.getByLabel(/ID jwè/).fill("123456789");
  await page.getByRole("button", { name: "Achte kounye a" }).click();
  await page.getByRole("link", { name: "Peye" }).click();
  await page.getByText("Bous Haiti Gaming").click();
  await page.getByRole("button", { name: "Pase kòmand lan" }).click();
  await page.waitForURL("**/ht/account/orders/**");
  await expect(page.getByText("N ap prepare l").first()).toBeVisible();
  const orderUrl = page.url();
  const orderId = orderUrl.split("/").pop()!;

  const adminPage = await (await browser.newContext()).newPage();
  await adminLogin(adminPage);
  await adminPage.goto(`/admin/orders/${orderId}`);
  await expect(adminPage.getByText("123456789")).toBeVisible();
  adminPage.once("dialog", (d) => d.accept("100 dyaman voye sou ID 123456789"));
  await adminPage.getByRole("button", { name: "Mark delivered…" }).click();
  await expect(adminPage.getByText("FULFILLED").first()).toBeVisible();

  await page.goto(orderUrl);
  await expect(page.getByText("100 dyaman voye sou ID 123456789")).toBeVisible();
});

test("customer exchanges HTG to USD", async ({ page }) => {
  await page.goto("/en/auth/login");
  await page.getByLabel("Email").fill(customer.email);
  await page.getByLabel("Password").fill(customer.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/en/account");
  await page.goto("/en/account/wallet/exchange");
  await page.getByLabel("Amount (HTG)").fill("1000");
  await page.getByRole("button", { name: "Get a quote" }).click();
  await expect(page.getByText("You receive")).toBeVisible();
  await page.getByRole("button", { name: "Confirm exchange" }).click();
  await expect(page.getByText("Exchange complete.")).toBeVisible();
});
