import { test, expect } from "@playwright/test";
import { newPage, registerCustomer } from "./helpers";

/**
 * Runs only against a server started with email configured (E2E_EMAIL_LOCK=1): the lock is off while email is off.
 */
test.skip(!process.env.E2E_EMAIL_LOCK, "needs a server with RESEND_API_KEY / EMAIL_FROM set");
test.describe.configure({ timeout: 120_000 });

test("unconfirmed customer can browse but not buy, deposit or exchange; can fix a wrong email", async ({ browser }) => {
  const c = await newPage(browser);
  const stamp = Date.now();
  await registerCustomer(c, "Kliyan Lock", `lock.${stamp}@example.com`, "Kliyan-Lock-2026!");

  // Browsing and the cart still work
  await c.goto("/ht/products/google-play-gift-card");
  await c.getByRole("button", { name: "Achte kounye a" }).click();
  await c.waitForURL("**/ht/cart");

  for (const path of ["/ht/checkout", "/ht/account/wallet/deposit", "/ht/account/wallet/exchange"]) {
    await c.goto(path);
    await expect(c.getByRole("heading", { name: "Konfime imèl ou pou kontinye" })).toBeVisible();
    await expect(c.getByText(`lock.${stamp}@example.com`)).toBeVisible();
  }

  // Fix a wrong address
  await c.getByRole("button", { name: /Chanje imèl la/ }).click();
  await c.getByLabel("Nouvo imèl").fill(`lock.fixed.${stamp}@example.com`);
  await c.getByRole("button", { name: "Anrejistre epi voye lyen an" }).click();
  await expect(c.getByText("Imèl la chanje. Nou voye yon nouvo lyen.")).toBeVisible();
  await expect(c.getByText(`lock.fixed.${stamp}@example.com`)).toBeVisible();

  // Support stays open
  await c.goto("/ht/account/support");
  await expect(c.getByRole("heading", { name: "Konfime imèl ou pou kontinye" })).toHaveCount(0);
});
