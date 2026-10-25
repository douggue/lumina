import type { Browser, Page } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { totp } from "./totp";

export const admin = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@haitigaming.test", password: process.env.E2E_ADMIN_PASSWORD ?? "AdminPassw0rd!2026" };
// Kept in a file: Playwright restarts the worker after a failed test, which would otherwise forget the 2FA secret
// and make every later staff sign-in fail too.
const SECRETS_FILE = join(tmpdir(), "hg-e2e-totp.json");
const secrets: Record<string, string> = existsSync(SECRETS_FILE) ? JSON.parse(readFileSync(SECRETS_FILE, "utf8")) : {};
const hooked = new WeakMap<Page, string>();
export function staffSecret(email: string) {
  return secrets[email];
}

/** Signs a staff member in; sets up 2FA on first sign-in and remembers the secret for later steps. */
export async function staffLogin(page: Page, who = admin) {
  await page.goto("/admin/login");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill(who.email);
  await page.getByLabel("Password").fill(who.password);
  await page.getByRole("button", { name: "Continue" }).click();
  const totpField = page.getByLabel("Authenticator code");
  await Promise.race([page.waitForURL("**/admin/setup-2fa"), totpField.waitFor()]);
  if (page.url().includes("setup-2fa")) {
    await page.getByLabel("Confirm your password").fill(who.password);
    await page.getByRole("button", { name: "Continue" }).click();
    secrets[who.email] = (await page.locator("p.font-mono").textContent())!.trim();
    writeFileSync(SECRETS_FILE, JSON.stringify(secrets));
    await page.getByLabel("6-digit code").fill(totp(secrets[who.email]));
    await page.getByRole("button", { name: "Activate" }).click();
  } else {
    await totpField.fill(totp(secrets[who.email]));
    await page.getByRole("button", { name: "Verify" }).click();
  }
  await page.waitForURL(/\/admin$/);
  // Answer step-up prompts (re-confirm with the authenticator code) automatically; one handler per page.
  const first = !hooked.has(page);
  hooked.set(page, who.email); // the person signed in last answers the prompts
  if (!first) return;
  page.on("dialog", async (d) => {
    if (d.message().startsWith("Security check")) await d.accept(totp(secrets[hooked.get(page)!]));
    // Other confirmations: accept, unless the test registered its own handler for this dialog.
    else if ((page as unknown as { listenerCount(e: string): number }).listenerCount("dialog") === 1) await d.accept();
  });
}

export async function newPage(browser: Browser) {
  return (await browser.newContext({ locale: "ht-HT" })).newPage();
}

export async function registerCustomer(page: Page, name: string, email: string, password: string, path = "/ht/auth/register") {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Non konplè").fill(name);
  await page.getByLabel("Imèl").fill(email);
  await page.getByLabel("Modpas").fill(password);
  await page.getByRole("button", { name: "Kreye yon kont" }).click();
  await page.waitForURL("**/ht/account");
}
