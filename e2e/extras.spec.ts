import { test, expect } from "@playwright/test";
import { newPage, registerCustomer, staffLogin } from "./helpers";

const stamp = Date.now();

test("custom role, data saver, offline page and account deletion", async ({ browser, request }) => {
  // Custom role with a single permission
  const a = await newPage(browser);
  await staffLogin(a);
  await a.goto("/admin/staff");
  await a.waitForLoadState("networkidle");
  const form = a.locator("form", { hasText: "New role name" });
  await form.getByLabel("New role name").fill(`Support nwit ${stamp}`);
  await form.getByLabel("Answer support tickets").check();
  await form.getByRole("button", { name: "Create role" }).click();
  await expect(a.getByText("Role saved")).toBeVisible();
  await expect(a.locator('select[name="role"]').locator("option", { hasText: `Custom: Support nwit ${stamp}` })).toHaveCount(1);

  // Data saver toggle adds the class and survives reload
  const c = await newPage(browser);
  await c.goto("/ht");
  await c.waitForLoadState("networkidle");
  await c.getByLabel(/Ekonomize done/).check();
  await c.reload();
  await expect(c.locator("html")).toHaveClass(/data-saver/);

  // Offline page and service worker are served
  expect((await request.get("/offline.html")).status()).toBe(200);
  expect((await request.get("/sw.js")).status()).toBe(200);

  // Account deletion erases personal data
  const email = `efase.${stamp}@example.com`;
  await registerCustomer(c, "Efase Mwen", email, "Efase-Kont-2026!");
  await c.goto("/ht/account/privacy");
  await c.waitForLoadState("networkidle");
  c.on("dialog", (d) => d.accept());
  await c.getByLabel("Ekri modpas ou pou konfime").fill("Efase-Kont-2026!");
  await c.getByRole("button", { name: "Efase kont mwen nèt" }).click();
  await c.waitForURL(/\/ht$/);
  await c.goto("/ht/auth/login");
  await c.waitForLoadState("networkidle");
  await c.getByLabel("Imèl").fill(email);
  await c.getByLabel("Modpas").fill("Efase-Kont-2026!");
  await c.getByRole("button", { name: "Konekte" }).click();
  await expect(c.getByText("Imèl oswa modpas la pa bon.")).toBeVisible();
});
