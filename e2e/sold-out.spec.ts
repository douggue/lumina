import { test, expect } from "@playwright/test";
import { newPage, staffLogin } from "./helpers";

/** Admin marks a whole product out of stock: it stays visible but can't be bought, then comes back. */
test("out of stock switch", async ({ browser, page }) => {
  const a = await newPage(browser);
  await staffLogin(a);
  await a.goto("/admin/products");
  await a.getByRole("link", { name: "Free Fire Diamonds" }).first().click();
  await a.getByRole("button", { name: "Mark all out of stock" }).click();
  await expect(a.getByText("All options out of stock")).toBeVisible();

  try {
    await page.goto("/ht/products/free-fire-diamonds");
    await expect(page.getByText("Pa disponib").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Achte kounye a" })).toBeDisabled();
    await page.goto("/ht/store");
    const card = page.locator(`a[href$="/products/free-fire-diamonds"]`).first();
    await expect(card).toContainText("Pa disponib");
  } finally {
    await a.getByRole("button", { name: "All back in stock" }).click();
    await expect(a.getByText("All options back in stock")).toBeVisible();
  }
  await page.goto("/ht/products/free-fire-diamonds");
  await expect(page.getByRole("button", { name: "Achte kounye a" })).toBeEnabled();
});
