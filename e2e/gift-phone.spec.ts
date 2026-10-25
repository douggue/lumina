import { test, expect } from "@playwright/test";

/** Phone numbers format as typed; a delivered gift card can be sent on WhatsApp with a private link the receiver opens. */
test("phone formats as typed, gift link shows the code to the receiver", async ({ page, browser }) => {
  const stamp = Date.now();
  await page.goto("/ht/auth/register");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Non konplè").fill("Woodly Charles");
  await page.getByLabel("Imèl").fill(`woodly.${stamp}@example.com`);
  const phone = page.locator("#phone");
  await phone.click();
  await phone.pressSequentially("34567890");
  await expect(phone).toHaveValue("+509 3456 7890");
  await page.getByLabel("Modpas").fill("Kliyan-Kado-2026!");
  await page.getByRole("button", { name: "Kreye yon kont" }).click();
  await page.waitForURL("**/ht/account");

  await page.goto("/ht/account/profile");
  await expect(page.locator("#phone")).toHaveValue("+509 3456 7890");

  // Buy a gift card with a message, pay (test MonCash), it's delivered.
  await page.goto("/ht/products/google-play-gift-card");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Achte kounye a" }).click();
  await page.waitForURL("**/ht/cart");
  await page.getByRole("link", { name: "Peye" }).click();
  await page.waitForURL("**/ht/checkout");
  await page.getByLabel("Mesaj pou moun k ap resevwa l (si w vle)").fill("Bòn fèt Nadia!");
  await page.getByText("MonCash", { exact: true }).first().click();
  await page.getByRole("button", { name: "Pase kòmand lan" }).click();
  await page.waitForURL("**/api/payments/moncash/mock**");
  await page.getByRole("button", { name: "Approve payment" }).click();
  await page.waitForURL("**/ht/account/orders/**");

  const share = page.locator("section", { hasText: "Se yon kado?" });
  await expect(share).toContainText("Bòn fèt Nadia!");
  const href = await share.getByRole("link", { name: "Voye l sou WhatsApp" }).getAttribute("href");
  expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
  const giftUrl = /\/ht\/gift\/[A-Za-z0-9_-]+/.exec(decodeURIComponent(href!))![0];

  // The receiver: no account.
  const r = await (await browser.newContext()).newPage();
  await r.goto(giftUrl);
  await expect(r.getByRole("heading", { name: "Woodly voye yon kado ba ou!" })).toBeVisible();
  await expect(r.getByText("Bòn fèt Nadia!")).toBeVisible();
  await expect(r.locator("code")).toHaveCount(0);
  await r.getByRole("button", { name: "Montre kòd la" }).click();
  await expect(r.locator("code").first()).toBeVisible();
  expect((await r.goto("/ht/gift/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))?.status()).toBe(404);
});
