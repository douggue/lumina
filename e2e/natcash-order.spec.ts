import { test, expect } from "@playwright/test";
import { registerCustomer } from "./helpers";

// 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

/** Order paid with NatCash: reference copied with spaces/dots, phone and a photo → sent for review. */
test("customer sends NatCash proof for an order", async ({ page }) => {
  const stamp = Date.now();
  await registerCustomer(page, "Mackenson Jean", `mack.${stamp}@example.com`, "Kliyan-Natcash-2026!");
  await page.goto("/ht/products/google-play-gift-card");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Achte kounye a" }).click();
  await page.waitForURL("**/ht/cart");
  await page.getByRole("link", { name: "Peye" }).click();
  await page.waitForURL("**/ht/checkout");
  await page.getByText("NatCash", { exact: true }).first().click();
  await page.getByRole("button", { name: "Pase kòmand lan" }).click();
  await page.waitForURL("**/ht/account/orders/**");

  await expect(page.getByRole("heading", { name: "Fini peman NatCash ou" })).toBeVisible();
  // A bad reference: clear message, and what was typed stays in the fields.
  await page.getByLabel("Referans tranzaksyon NatCash").fill("TX#1");
  await page.getByLabel("Nimewo telefòn ou peye avè l").fill("+509 3456 7890");
  await page.getByRole("button", { name: "Voye peman an" }).click();
  await expect(page.getByText("Referans lan pa bon.", { exact: false })).toBeVisible();
  await expect(page.getByLabel("Nimewo telefòn ou peye avè l")).toHaveValue("+509 3456 7890");

  await page.getByLabel("Referans tranzaksyon NatCash").fill(`NC ${stamp}.A/1`);
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({ name: "natcash.png", mimeType: "image/png", buffer: PNG });
  await page.getByRole("button", { name: "Voye peman an" }).click();
  await expect(page.getByText("Mèsi. Ekip nou an ap verifye peman ou.")).toBeVisible();
});
