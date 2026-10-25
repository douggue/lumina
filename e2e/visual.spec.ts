import { test, expect } from "@playwright/test";

/**
 * Screenshot comparison: catches unintended layout/style changes on key screens.
 * First run records the reference images (e2e/visual.spec.ts-snapshots/); later runs compare against them.
 * After an intended design change: npx playwright test e2e/visual.spec.ts --update-snapshots
 * Areas that depend on store data (announcement, products, prices) are masked.
 */
const opts = { maxDiffPixelRatio: 0.02, animations: "disabled" as const };

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  // The announcement text is store content, not design: hide it for every screenshot.
  await page.addInitScript(() => {
    const style = document.createElement("style");
    style.textContent = "[data-announcement]{display:none!important}";
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
  });
});

test("sign-in and sign-up forms", async ({ page }) => {
  await page.goto("/ht/auth/login");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main form").first()).toHaveScreenshot("login-form.png", opts);
  await page.goto("/ht/auth/register");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main form").first()).toHaveScreenshot("register-form.png", opts);
});

test("home hero and header", async ({ page }) => {
  await page.goto("/ht");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("header").first()).toHaveScreenshot("header.png", opts);
  await expect(page.locator("main section").first()).toHaveScreenshot("home-hero.png", { ...opts, mask: [page.locator("main section").first().locator("img")] });
});

test("page not found", async ({ page }) => {
  await page.goto("/ht/products/does-not-exist");
  await page.waitForLoadState("networkidle");
  await expect(page.locator("main")).toHaveScreenshot("not-found.png", opts);
});

test("offline page", async ({ page }) => {
  await page.goto("/offline.html");
  await expect(page).toHaveScreenshot("offline.png", opts);
});
