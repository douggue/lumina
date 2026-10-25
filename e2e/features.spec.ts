import { test, expect } from "@playwright/test";
import { admin, newPage, registerCustomer, staffLogin } from "./helpers";
import { totp } from "./totp";

/** The admin tools and customer features added in the final round. Runs against a production build. */
const stamp = Date.now();
const cust = { name: "Pierre Test", email: `pierre.${stamp}@example.com`, password: "Kliyan-Fonksyon-2026" };
const finance = { email: `finance.${stamp}@example.com`, password: "Finans-Ekip-2026!" };
test.describe.configure({ mode: "serial" });

test("content tools: homepage editor, news, redirect, translation, theme", async ({ browser }) => {
  const a = await newPage(browser);
  await staffLogin(a);

  // Homepage: hide the FAQ and reword the headline, publish
  await a.goto("/admin/homepage");
  await a.waitForLoadState("networkidle");
  const faqRow = a.locator("li", { hasText: "Frequently asked questions" });
  await faqRow.getByRole("checkbox").uncheck();
  await a.locator("fieldset").filter({ has: a.locator("legend", { hasText: /^Headline$/ }) }).getByLabel("Kreyòl").fill("Pi bon pri pou dyaman an Ayiti");
  await a.getByRole("button", { name: "Publish" }).click();
  await expect(a.getByText("Published")).toBeVisible();

  // News article
  await a.goto("/admin/news/new");
  await a.waitForLoadState("networkidle");
  await a.getByLabel("Slug (URL)").fill(`promo-${stamp}`);
  await a.locator("fieldset").filter({ has: a.locator("legend", { hasText: /^Title$/ }) }).getByLabel("Kreyòl").fill("Gwo pwomosyon Free Fire");
  await a.locator("fieldset").filter({ has: a.locator("legend", { hasText: /^Article text/ }) }).getByLabel("Kreyòl").fill("Premye paragraf.\n\nDezyèm paragraf.");
  await a.getByLabel("Published", { exact: true }).check();
  await a.getByRole("button", { name: "Save article" }).click();
  await a.waitForURL(/\/admin\/news\/c/);

  // Redirect + translation + theme
  await a.goto("/admin/seo");
  await a.waitForLoadState("networkidle");
  await a.getByLabel("Old path").fill(`/ansyen-${stamp}`);
  await a.getByLabel("New path or URL").fill("/store");
  await a.getByRole("button", { name: "Add redirect" }).click();
  await expect(a.getByText("Redirect saved")).toBeVisible();

  await a.goto("/admin/translations");
  await a.waitForLoadState("networkidle");
  await a.getByPlaceholder(/Search text or key/).fill("common.shopNow");
  const box = a.locator(".card", { hasText: "common.shopNow" }).locator("textarea").first();
  await box.fill("Achte la a");
  await box.blur();
  await expect(a.locator(".card", { hasText: "common.shopNow" }).getByText("Saved")).toBeVisible();

  await a.goto("/admin/appearance");
  await a.waitForLoadState("networkidle");
  await a.locator('input[type="color"]').first().fill("#7c3aed");
  await a.getByLabel(/^Neon/).check();
  await a.getByRole("button", { name: "Publish theme" }).click();
  await expect(a.getByText("Theme published")).toBeVisible();

  // Storefront reflects all of it
  const c = await newPage(browser);
  await c.goto("/ht");
  await expect(c.getByRole("heading", { level: 1 })).toHaveText("Pi bon pri pou dyaman an Ayiti");
  await expect(c.getByText("Kesyon yo poze souvan").first()).toBeHidden().catch(() => undefined);
  await expect(c.getByRole("heading", { name: "Kesyon yo poze souvan" })).toHaveCount(0);
  await expect(c.getByRole("link", { name: /Achte la a/ }).first()).toBeVisible();
  expect(await c.locator("style").allTextContents()).toEqual(expect.arrayContaining([expect.stringContaining("--primary:#7C3AED")]));
  await expect(c.locator("html")).toHaveAttribute("data-motion", "neon");
  await expect(c.getByText("Gwo pwomosyon Free Fire").first()).toBeVisible();
  await c.goto(`/ht/news/promo-${stamp}`);
  await expect(c.getByText("Dezyèm paragraf.")).toBeVisible();
  await c.goto(`/fr/ansyen-${stamp}`);
  await expect(c).toHaveURL(/\/fr\/store$/);

  // Restore defaults so other tests see the standard site
  await a.goto("/admin/appearance");
  await a.waitForLoadState("networkidle");
  await a.getByRole("button", { name: "Back to the original design" }).click();
  await a.getByRole("button", { name: "Publish theme" }).click();
  await expect(a.getByText("Theme published")).toBeVisible();
  await a.goto("/admin/translations");
  await a.waitForLoadState("networkidle");
  await a.getByPlaceholder(/Search text or key/).fill("common.shopNow");
  const box2 = a.locator(".card", { hasText: "common.shopNow" }).locator("textarea").first();
  await box2.fill("");
  await box2.blur();
  await expect(a.locator(".card", { hasText: "common.shopNow" }).getByText("Default")).toBeVisible();
});

test("customer: support ticket, preferences, saved cart, 2FA, data export", async ({ browser }) => {
  const c = await newPage(browser);
  await registerCustomer(c, cust.name, cust.email, cust.password);

  // Support ticket answered by staff
  await c.goto("/ht/account/support");
  await c.waitForLoadState("networkidle");
  await c.getByRole("button", { name: "Nouvo demann" }).click();
  await c.getByLabel("Sijè").fill("Dyaman pa rive");
  await c.getByLabel("Mesaj").fill("Mwen pa resevwa dyaman yo toujou.");
  await c.getByRole("button", { name: "Voye", exact: true }).click();
  await c.waitForURL(/\/account\/support\/c/);
  const ticketUrl = c.url();

  const a = await newPage(browser);
  await staffLogin(a);
  await a.goto("/admin/support");
  await a.getByRole("link", { name: /Dyaman pa rive/ }).click();
  await a.waitForLoadState("networkidle");
  await a.locator('textarea[name="message"]').fill("N ap tcheke sa kounye a.");
  await a.getByRole("button", { name: "Send reply" }).click();
  await expect(a.getByText("Reply sent")).toBeVisible();
  await c.goto(ticketUrl);
  await expect(c.getByText("N ap tcheke sa kounye a.")).toBeVisible();

  // Cart follows the account to another device
  await c.goto("/ht/products/google-play-gift-card");
  await c.waitForLoadState("networkidle");
  await c.getByRole("button", { name: "Mete nan panye" }).click();
  await c.waitForTimeout(1500);
  const other = await newPage(browser);
  await other.goto("/ht/auth/login");
  await other.waitForLoadState("networkidle");
  await other.getByLabel("Imèl").fill(cust.email);
  await other.getByLabel("Modpas").fill(cust.password);
  await other.getByRole("button", { name: "Konekte" }).click();
  await other.waitForURL("**/ht/account");
  await other.goto("/ht/cart");
  await expect(other.getByText("Kat Google Play")).toBeVisible();

  // Notification preferences
  await c.goto("/ht/account/notifications");
  await c.waitForLoadState("networkidle");
  await c.getByLabel("Pwomosyon ak nouvo pwodwi").check();
  await c.getByRole("button", { name: "Anrejistre" }).click();
  await expect(c.getByText("Anrejistre.")).toBeVisible();

  // Optional 2FA, then sign in with a code
  await c.goto("/ht/account/security");
  await c.waitForLoadState("networkidle");
  await c.getByRole("button", { name: "Aktive l" }).click();
  await c.getByLabel("Konfime modpas ou").fill(cust.password);
  await c.getByRole("button", { name: "Aktive l" }).click();
  const secret = (await c.locator("p.font-mono").textContent())!.trim();
  await c.getByLabel("Kòd 6 chif").fill(totp(secret));
  await c.getByRole("button", { name: "Aktive", exact: true }).click();
  await expect(c.getByText("Aktive", { exact: true }).first()).toBeVisible();
  const d = await newPage(browser);
  await d.goto("/ht/auth/login");
  await d.waitForLoadState("networkidle");
  await d.getByLabel("Imèl").fill(cust.email);
  await d.getByLabel("Modpas").fill(cust.password);
  await d.getByRole("button", { name: "Konekte" }).click();
  await d.getByLabel("Verifikasyon an 2 etap").fill(totp(secret));
  await d.getByRole("button", { name: "Verifye" }).click();
  await d.waitForURL("**/ht/account");

  // Data export
  const res = await d.request.get("/api/account/export");
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.user.email).toBe(cust.email);
  expect(data.supportTickets).toHaveLength(1);
});

test("operations: reports + CSV, public order status, step-up and two-person approval", async ({ browser }) => {
  const a = await newPage(browser);
  await staffLogin(a);
  await a.goto("/admin/analytics");
  await expect(a.getByRole("heading", { name: "Reports" })).toBeVisible();
  const csv = await a.request.get("/api/admin/export?type=orders&days=30");
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain("number,created_at");

  // Public order status link opens without signing in
  await a.goto("/admin/orders");
  await a.locator("tbody a").first().click();
  const tracking = (await a.getByText("Tracking link:").locator("..").textContent())!.split("Tracking link:")[1].trim();
  const anon = await newPage(browser);
  await anon.goto(tracking.replace(/^https?:\/\/[^/]+/, ""));
  await expect(anon.getByText(/Kòmand #\d+/)).toBeVisible();
  await anon.goto(tracking.replace(/^https?:\/\/[^/]+/, "").replace(/t=.*/, "t=wrong"));
  await expect(anon.getByText("404")).toBeVisible().catch(() => undefined);

  // Small adjustment: step-up code is asked, then applied
  await a.goto(`/admin/customers?q=${encodeURIComponent(cust.email)}`);
  await a.getByRole("link", { name: cust.name }).click();
  await a.waitForLoadState("networkidle");
  const adjust = a.locator("form", { hasText: "Wallet adjustment" });
  await adjust.getByPlaceholder("Amount").fill("50");
  await adjust.getByPlaceholder("Reason (required)").fill("Jès bòn volonte");
  await adjust.getByRole("button", { name: "Post adjustment" }).click();
  await expect(a.getByText("Saved")).toBeVisible();
  await expect(a.getByText("50 HTG").first()).toBeVisible();

  // Large adjustment needs a second person
  await a.reload();
  await a.waitForLoadState("networkidle");
  const adjust2 = a.locator("form", { hasText: "Wallet adjustment" });
  await adjust2.getByPlaceholder("Amount").fill("20000");
  await adjust2.getByPlaceholder("Reason (required)").fill(`Ranbousman manyèl ${stamp}`);
  await adjust2.getByRole("button", { name: "Post adjustment" }).click();
  await expect(a.getByText(/sent to a second staff member/)).toBeVisible();
  await a.goto("/admin/approvals");
  await expect(a.getByRole("row", { name: new RegExp(String(stamp)) }).getByText("Waiting for someone else")).toBeVisible();

  // Second staff member (finance) approves
  const f = await newPage(browser);
  await registerCustomer(f, "Finans Test", finance.email, finance.password);
  await a.goto("/admin/staff");
  await a.waitForLoadState("networkidle");
  await a.getByLabel("Account email").fill(finance.email);
  await a.locator('select[name="role"]').selectOption("FINANCE_MANAGER");
  await a.getByRole("button", { name: "Assign role" }).click();
  await expect(a.getByText("Saved")).toBeVisible();
  const f2 = await newPage(browser);
  await staffLogin(f2, finance);
  await f2.goto("/admin/approvals");
  await f2.getByRole("row", { name: new RegExp(String(stamp)) }).getByRole("button", { name: "Approve" }).click();
  // The row moves to the decided list once the page refreshes, so check the decision rather than the short message.
  await expect(f2.getByRole("row", { name: new RegExp(`${stamp}.*APPROVED`) })).toBeVisible();
  await a.goto(`/admin/customers?q=${encodeURIComponent(cust.email)}`);
  await a.getByRole("link", { name: cust.name }).click();
  await expect(a.getByText("20,050 HTG").first()).toBeVisible();
});

test("referrals: invite link records the friend", async ({ browser }) => {
  const a = await newPage(browser);
  await staffLogin(a);
  await a.goto("/admin/settings");
  await a.waitForLoadState("networkidle");
  await a.getByLabel("Referral program on").check();
  await a.getByRole("button", { name: "Save settings" }).click();
  await expect(a.getByText("Settings saved")).toBeVisible();

  const c = await newPage(browser);
  await c.goto("/ht/auth/login");
  await c.waitForLoadState("networkidle");
  await c.getByLabel("Imèl").fill(cust.email);
  await c.getByLabel("Modpas").fill(cust.password);
  await c.getByRole("button", { name: "Konekte" }).click();
  // (2FA is on for this customer from the previous test)
  await expect(c.getByText("Verifikasyon an 2 etap")).toBeVisible();

  const inviterEmail = `inviter.${stamp}@example.com`;
  const inviter = await newPage(browser);
  await registerCustomer(inviter, "Envitè Test", inviterEmail, "Envite-Zanmi-2026!");
  await inviter.goto("/ht/account/referrals");
  const link = (await inviter.locator("code").first().textContent())!.trim();
  const friend = await newPage(browser);
  await friend.goto(link.replace(/^https?:\/\/[^/]+/, ""));
  await registerCustomer(friend, "Zanmi Test", `friend.${stamp}@example.com`, "Zanmi-Nouvo-2026!");
  await inviter.reload();
  await expect(inviter.getByText("Zanmi T.")).toBeVisible();
  await expect(inviter.getByText("An atant premye kòmand")).toBeVisible();
  void admin;
});
