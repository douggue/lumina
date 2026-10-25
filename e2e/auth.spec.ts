import { test, expect, type Page } from "@playwright/test";
import { totp } from "./totp";

/** Sign-up hardening, password recovery without email, suspended accounts and staff backup codes. */
const stamp = Date.now();
const customer = { name: "Marie Test", email: `marie.${stamp}@example.com`, password: "Kliyan-Pwotèj-2026" };
const newPassword = "Nouvo-Modpas-2026!";
const admin = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@haitigaming.test", password: process.env.E2E_ADMIN_PASSWORD ?? "AdminPassw0rd!2026" };
let secret = "";
let backupCodes: string[] = [];
test.describe.configure({ mode: "serial" });

async function register(page: Page, email: string, password: string) {
  await page.goto("/ht/auth/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Non konplè").fill(customer.name);
  await page.getByLabel("Imèl").fill(email);
  await page.getByLabel("Modpas").fill(password);
  await page.getByRole("button", { name: "Kreye yon kont" }).click();
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/ht/auth/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Imèl").fill(email);
  await page.getByLabel("Modpas").fill(password);
  await page.getByRole("button", { name: "Konekte" }).click();
}

test("sign-up rejects breached passwords and doesn't reveal existing emails", async ({ page }) => {
  await register(page, `breach.${stamp}@example.com`, "Password123");
  await expect(page.getByText("Modpas sa a te parèt nan yon fuit done")).toBeVisible();

  await register(page, customer.email, customer.password);
  await page.waitForURL("**/ht/account");
  await page.context().clearCookies();

  await register(page, customer.email, "Yon-Lot-Modpas-2026");
  await expect(page.getByText("Nou pa t ka kreye kont lan ak enfòmasyon sa yo.")).toBeVisible();
});

test("forgot password without email sends the customer to WhatsApp", async ({ page }) => {
  await page.goto("/ht/auth/login");
  await page.getByRole("link", { name: "Ou bliye modpas ou?" }).click();
  await page.waitForURL("**/ht/auth/forgot");
  await page.getByLabel("Imèl").fill(customer.email);
  const wa = page.getByRole("link", { name: "Mande èd sou WhatsApp" });
  await expect(wa).toHaveAttribute("href", new RegExp(encodeURIComponent(customer.email).replace(/[.%]/g, "\\$&")));
});

test("admin backup codes work, and admin creates a one-time reset link", async ({ page, browser }) => {
  // First admin sign-in: set up 2FA and keep the backup codes
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/admin/setup-2fa");
  await page.getByLabel("Confirm your password").fill(admin.password);
  await page.getByRole("button", { name: "Continue" }).click();
  secret = (await page.locator("p.font-mono").textContent())!.trim();
  backupCodes = await page.locator("details li").allTextContents();
  expect(backupCodes.length).toBeGreaterThan(0);
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Activate" }).click();
  await page.waitForURL(/\/admin$/);

  // Sign in again on a fresh device with a backup code instead of the phone
  const p2 = await (await browser.newContext()).newPage();
  await p2.goto("/admin/login");
  await p2.waitForLoadState("networkidle");
  await p2.getByLabel("Email").fill(admin.email);
  await p2.getByLabel("Password").fill(admin.password);
  await p2.getByRole("button", { name: "Continue" }).click();
  await p2.getByRole("button", { name: "Lost your phone? Use a backup code" }).click();
  await p2.getByLabel("Backup code").fill(backupCodes[0]);
  await p2.getByRole("button", { name: "Verify" }).click();
  await p2.waitForURL(/\/admin$/);

  // Reset link for the customer
  await p2.goto(`/admin/customers?q=${encodeURIComponent(customer.email)}`);
  await p2.getByRole("link", { name: customer.name }).click();
  await p2.waitForLoadState("networkidle");
  p2.once("dialog", (d) => d.accept());
  await p2.getByRole("button", { name: "Create reset link" }).click();
  const url = await p2.locator("input[readonly]").inputValue();
  expect(url).toContain("/ht/auth/reset?token=");

  // Customer uses it
  const c = await (await browser.newContext()).newPage();
  await c.goto(url.replace(/^https?:\/\/[^/]+/, ""));
  await c.waitForLoadState("networkidle");
  await c.getByLabel("Modpas").fill(newPassword);
  await c.getByRole("button", { name: "Anrejistre nouvo modpas la" }).click();
  await expect(c.getByText("Modpas ou chanje.")).toBeVisible();

  // The link only works once
  await c.goto(url.replace(/^https?:\/\/[^/]+/, ""));
  await c.waitForLoadState("networkidle");
  await c.getByLabel("Modpas").fill("Yon-Lot-Ankò-2026!");
  await c.getByRole("button", { name: "Anrejistre nouvo modpas la" }).click();
  await expect(c.getByText("Lyen sa a pa bon ankò")).toBeVisible();

  await login(c, customer.email, customer.password);
  await expect(c.getByText("Imèl oswa modpas la pa bon.")).toBeVisible();
  await login(c, customer.email, newPassword);
  await c.waitForURL("**/ht/account");

  // Suspended accounts are refused at sign-in
  await p2.goto(p2.url().replace(/\?.*$/, ""));
  p2.once("dialog", (d) => d.accept());
  await p2.getByRole("button", { name: "Suspend & sign out" }).click();
  await expect(p2.getByText("SUSPENDED").first()).toBeVisible();
  const d = await (await browser.newContext()).newPage();
  await login(d, customer.email, newPassword);
  await expect(d.getByText("Kont sa a pa aktif.")).toBeVisible();
});
