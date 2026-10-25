import { test, expect, type Page } from "@playwright/test";
import { totp } from "./totp";

/** Admin uploads product, gallery, category and logo images; the storefront shows them. */
const admin = { email: process.env.E2E_ADMIN_EMAIL ?? "admin@haitigaming.test", password: process.env.E2E_ADMIN_PASSWORD ?? "AdminPassw0rd!2026" };

async function makePng(page: Page, color: string, label: string) {
  await page.setContent(`<div id="a" style="width:800px;height:600px;background:linear-gradient(135deg,${color},#0D1B35);color:#fff;font:bold 90px system-ui;display:grid;place-items:center">${label}</div>`);
  return page.locator("#a").screenshot({ type: "png" });
}

test("admin uploads images and the store shows them", async ({ page, browser }) => {
  const scratch = await (await browser.newContext()).newPage();
  const main = await makePng(scratch, "#F59E0B", "FREE FIRE");
  const extra = await makePng(scratch, "#EF4444", "💎 310");
  const cat = await makePng(scratch, "#1467F5", "🎮");

  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL("**/admin/setup-2fa");
  await page.getByLabel("Confirm your password").fill(admin.password);
  await page.getByRole("button", { name: "Continue" }).click();
  const secret = (await page.locator("p.font-mono").textContent())!.trim();
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Activate" }).click();
  await page.waitForURL(/\/admin$/);

  await page.goto("/admin/products");
  await page.getByRole("link", { name: "Free Fire Diamonds" }).click();
  await page.waitForURL(/\/admin\/products\/c/);
  await page.waitForLoadState("networkidle");
  await page.locator('input[type=file]').first().setInputFiles({ name: "main.png", mimeType: "image/png", buffer: main });
  await expect(page.getByText("Uploading…")).toHaveCount(0, { timeout: 15000 });
  await expect(page.locator("input[name=image]")).toHaveValue(/\/media\/products\//);
  // Earlier runs may have filled the gallery (8 photos max, then the upload button is hidden): make room.
  while ((await page.locator("input[name=gallery]").count()) >= 8) {
    const n = await page.locator("input[name=gallery]").count();
    await page.getByRole("button", { name: "✕" }).first().click();
    await expect(page.locator("input[name=gallery]")).toHaveCount(n - 1);
  }
  const galleryBefore = await page.locator("input[name=gallery]").count();
  await page.locator('input[type=file]').nth(1).setInputFiles({ name: "extra.png", mimeType: "image/png", buffer: extra });
  await expect(page.locator('input[name=gallery]')).toHaveCount(galleryBefore + 1);
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.goto("/admin/products");
  await page.waitForLoadState("networkidle");
  const catForm = page.locator("form", { has: page.locator('input[name=slug][value="game-top-ups"]') });
  // Two uploads per category: the big background first, then the small square icon.
  await catForm.locator("input[type=file]").nth(0).setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: main });
  await expect(catForm.locator('input[name=cover]')).toHaveValue(/\/media\/categories\//);
  await catForm.locator("input[type=file]").nth(1).setInputFiles({ name: "cat.png", mimeType: "image/png", buffer: cat });
  await expect(catForm.locator('input[name=image]')).toHaveValue(/\/media\/categories\//);
  await catForm.getByRole("button", { name: "Save" }).click();
  await expect(catForm.getByText("Saved")).toBeVisible();

  // Wrong file type is refused
  await page.goto("/admin/settings");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type=file]').first().setInputFiles({ name: "x.png", mimeType: "image/png", buffer: Buffer.from("not an image") });
  await expect(page.getByText("Use a JPG, PNG or WebP image")).toBeVisible();

  await page.goto("/ht/products/free-fire-diamonds");
  await expect(page.locator('img[alt="Dyaman Free Fire"]').first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Dyaman Free Fire 2" })).toBeVisible();
  await page.goto("/ht");
  await expect(page.locator('img[alt="Dyaman Free Fire"]').first()).toBeVisible();
  // The category card shows the big background picture
  await expect(page.locator('a[href$="/categories/game-top-ups"] img[src*="categories"]').first()).toBeVisible();
  await page.screenshot({ path: "docs/screenshots/home-with-images.png", fullPage: false });
  await page.goto("/ht/products/free-fire-diamonds");
  await page.screenshot({ path: "docs/screenshots/product-with-gallery.png" });
});
