import { test, expect } from "@playwright/test";

/**
 * First-run setup on an EMPTY database (run against a fresh deploy only):
 *   BASE_URL=http://localhost:3001 SETUP_CODE=… npx playwright test e2e/setup.spec.ts
 */
test.skip(!process.env.SETUP_CODE, "needs SETUP_CODE and a server on an empty database");

test("first-run setup creates the owner and loads the demo catalog", async ({ page }) => {
  await page.goto("/admin/setup");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Setup code").fill("wrong-code-wrong-code-12");
  await page.getByLabel("Your name").fill("Owner Test");
  await page.getByLabel("Email").fill("owner@haitigaming.test");
  await page.getByLabel(/Password/).fill("Owner-Setup-Pass-2026!");
  await page.getByRole("button", { name: "Create admin account" }).click();
  await expect(page.getByText("The setup code doesn't match CRON_SECRET.")).toBeVisible();

  await page.getByLabel("Setup code").fill(process.env.SETUP_CODE!);
  await page.getByRole("button", { name: "Create admin account" }).click();
  await page.waitForURL("**/admin/login?setup=1");
  await expect(page.getByText("Admin account created.")).toBeVisible();

  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill("owner@haitigaming.test");
  await page.getByLabel("Password").fill("Owner-Setup-Pass-2026!");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/admin/setup-2fa");

  await page.goto("/admin/setup");
  await expect(page.getByText("Setup is done")).toBeVisible();

  await page.goto("/ht/store");
  await expect(page.locator('a[href$="/products/free-fire-diamonds"]').first()).toBeVisible();
});
