import { test, expect } from "@playwright/test";
import { staffLogin } from "./helpers";

test("phone menu opens full screen and the bottom bar navigates", async ({ page }) => {
  await page.goto("/ht");
  await page.waitForLoadState("networkidle");
  await page.locator('button[aria-controls="mobile-menu"]').click();
  const menu = page.locator("#mobile-menu");
  const box = await menu.boundingBox();
  expect(box!.height).toBeGreaterThan(500); // regression: the header's blur once trapped it at 64px
  await menu.getByRole("link", { name: "Kategori" }).click();
  await page.waitForURL("**/ht/categories");

  const bar = page.getByRole("navigation", { name: "Meni" });
  await bar.getByRole("link", { name: "Boutik" }).click();
  await page.waitForURL("**/ht/store");
  await expect(bar.getByRole("link", { name: "Boutik" })).toHaveAttribute("aria-current", "page");
});

test("admin bottom bar and More menu work on a phone", async ({ page }) => {
  await staffLogin(page);
  const bar = page.getByRole("navigation", { name: "Quick admin navigation" });
  await bar.getByRole("link", { name: "Orders" }).click();
  await page.waitForURL("**/admin/orders");
  await bar.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Settings" }).click();
  await page.waitForURL("**/admin/settings");
});
