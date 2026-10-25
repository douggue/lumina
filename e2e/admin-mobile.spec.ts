import { test, expect } from "@playwright/test";
import { staffLogin } from "./helpers";

/** Every admin screen must fit a phone: no sideways scrolling of the page itself. */
const PAGES = ["", "orders", "payments", "reconciliation", "risk", "approvals", "support", "products", "codes", "media", "customers", "wallet", "referrals", "analytics", "homepage", "news", "pages", "navigation", "newsletter", "appearance", "translations", "seo", "staff", "security", "payment-methods", "email", "settings", "audit"];

test("admin pages fit a phone screen", async ({ page }) => {
  test.setTimeout(240_000);
  await staffLogin(page);
  // Detail pages: open the first item of each list
  const details: string[] = [];
  for (const [list, re] of [["orders", /\/admin\/orders\/c/], ["customers", /\/admin\/customers\/c/], ["products", /\/admin\/products\/c/], ["support", /\/admin\/support\/c/], ["news", /\/admin\/news\/c/], ["pages", /\/admin\/pages\/c/]] as const) {
    await page.goto(`/admin/${list}`);
    const href = await page.locator("main a[href]").evaluateAll((as, src) => as.map((a) => a.getAttribute("href")).find((h) => h && new RegExp(src).test(h)) ?? null, re.source);
    if (href) details.push(href);
  }
  const problems: string[] = [];
  for (const path of [...PAGES.map((p) => `/admin${p ? "/" + p : ""}`), ...details]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const over = document.documentElement.scrollWidth - vw;
      const culprits: string[] = [];
      if (over > 1) {
        for (const el of Array.from(document.querySelectorAll("main *"))) {
          const b = el.getBoundingClientRect();
          if (b.right > vw + 1 && b.width > 0) {
            let p: Element | null = el.parentElement, scrolls = false;
            while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll" || o === "hidden") { scrolls = true; break; } p = p.parentElement; }
            if (!scrolls) culprits.push(`${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").split(" ").slice(0, 4).join(".")} w=${Math.round(b.width)}`);
          }
          if (culprits.length >= 3) break;
        }
      }
      return { over, culprits };
    });
    if (r.over > 1) problems.push(`${path}: +${r.over}px  ${r.culprits.join(" | ")}`);
    await page.screenshot({ path: `test-results/admin-mobile${path.replace(/\//g, "_")}.png`, fullPage: true });
  }
  console.log(problems.length ? "OVERFLOW:\n" + problems.join("\n") : "All admin pages fit.");
  expect(problems).toEqual([]);
});
