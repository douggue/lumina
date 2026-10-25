import { test, expect } from "@playwright/test";
import { newPage, registerCustomer } from "./helpers";

test.describe.configure({ timeout: 120_000 });

/** A small real PNG drawn in the browser (the picker shrinks photos with a canvas, so it must be a real image). */
async function png(page: import("@playwright/test").Page) {
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 400;
    c.height = 300;
    const g = c.getContext("2d")!;
    g.fillStyle = "#1467F5";
    g.fillRect(0, 0, 400, 300);
    g.fillStyle = "#fff";
    g.font = "bold 40px sans-serif";
    g.fillText("PEMAN", 100, 160);
    return c.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(data, "base64");
}

test("support: photo is added with the picker, previewed and sent with the message", async ({ browser }) => {
  const c = await newPage(browser);
  await registerCustomer(c, "Kliyan Sipò", `sipo.${Date.now()}@example.com`, "Kliyan-Sipo-2026!");
  await c.goto("/ht/account/support");
  await c.waitForLoadState("networkidle");
  const startBtn = c.getByRole("button", { name: /Nouvo demann|Nouvo/ }).first();
  if (await startBtn.isVisible()) await startBtn.click();
  await c.getByLabel("Sijè").fill("Kòmand mwen pa rive");
  await c.getByLabel("Mesaj").fill("Mwen peye men mwen poko resevwa dyaman yo.");
  await c.locator("#photo-attachment").setInputFiles({ name: "kapti.png", mimeType: "image/png", buffer: await png(c) });
  await expect(c.getByText(/✓ Foto ekran/)).toBeVisible();
  await c.getByRole("button", { name: "Voye" }).click();
  await c.waitForURL(/\/account\/support\/c/);
  await expect(c.getByRole("link", { name: /Foto ekran/ })).toBeVisible();
});

test("dark mode stays on after changing language on the sign-in page", async ({ browser }) => {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem("hv_theme", "dark"));
  const p = await ctx.newPage();
  await p.goto("/ht/auth/login");
  await p.waitForLoadState("networkidle");
  await expect(p.locator("html")).toHaveClass(/dark/);
  await p.getByRole("radio", { name: "Français" }).click();
  await p.waitForURL("**/fr/auth/login");
  await p.waitForLoadState("networkidle");
  await expect(p.locator("html")).toHaveClass(/dark/);
  await p.getByRole("radio", { name: "English" }).click();
  await p.waitForURL("**/en/auth/login");
  await expect(p.locator("html")).toHaveClass(/dark/);
});
