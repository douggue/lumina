import { test, expect, type Page } from "@playwright/test";
import { newPage, registerCustomer } from "./helpers";

/** Items removed from the cart stay removed: after a reload, and on the account's other devices. */
const stamp = Date.now();
const email = `cart.${stamp}@example.com`;
const password = "Kliyan-Panye-2026!";

async function addToCart(p: Page, slug: string, option: string) {
  await p.goto(`/ht/products/${slug}`);
  await p.waitForLoadState("networkidle");
  await p.getByText(option, { exact: true }).click();
  await p.getByRole("button", { name: "Achte kounye a" }).click();
  await p.waitForURL("**/ht/cart");
}

test("a removed item doesn't come back", async ({ browser }) => {
  const a = await newPage(browser);
  await registerCustomer(a, "Ketly Noel", email, password);
  await addToCart(a, "playstation-store-card", "$10 USD");
  await addToCart(a, "playstation-store-card", "$25 USD");
  await a.waitForTimeout(1500); // saved on the account
  const lines = a.locator("main li", { hasText: "Retire" });
  await expect(lines).toHaveCount(2);

  // Remove, then leave right away (before the delayed save): must not come back.
  await lines.filter({ hasText: "$10" }).getByRole("button", { name: "Retire" }).click();
  await a.reload();
  await a.waitForLoadState("networkidle");
  await a.waitForTimeout(1500);
  await expect(a.locator("main li", { hasText: "Retire" })).toHaveCount(1);
  await expect(a.locator("main li", { hasText: "Retire" })).not.toContainText("$10");

  // Another phone, same account: sees the same cart, removes the last item.
  const b = await newPage(browser);
  await b.goto("/ht/auth/login");
  await b.waitForLoadState("networkidle");
  await b.getByLabel("Imèl").fill(email);
  await b.getByLabel("Modpas").fill(password);
  await b.getByRole("button", { name: "Konekte" }).click();
  await b.waitForURL("**/ht/account");
  await b.goto("/ht/cart");
  await b.waitForLoadState("networkidle");
  await expect(b.locator("main li", { hasText: "Retire" })).toHaveCount(1);
  await b.locator("main li", { hasText: "Retire" }).getByRole("button", { name: "Retire" }).click();
  await expect(b.getByText("Panye ou vid.")).toBeVisible();
  await b.waitForTimeout(1500);

  // First phone still has the old copy: the newer (empty) cart wins.
  await a.reload();
  await a.waitForLoadState("networkidle");
  await expect(a.getByText("Panye ou vid.")).toBeVisible({ timeout: 10_000 });
});
