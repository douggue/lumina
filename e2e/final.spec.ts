import { test, expect, type BrowserContext } from "@playwright/test";
import { admin, newPage, registerCustomer, staffLogin } from "./helpers";

test.describe.configure({ mode: "serial", timeout: 150_000 });

const stamp = Date.now();
const methodCode = `bank${stamp}`.slice(0, 20);
const methodName = `Bank Test ${stamp % 100000}`;
const pageSlug = `promo-${stamp}`;
const subSlug = `ff-${stamp}`;
const manualRef = `BT${stamp}`;
const announcement = `Pwomo espesyal ${stamp}`;

/** Sign out but keep the anonymous browser id, like a person switching accounts on one phone. */
async function signOutKeepDevice(ctx: BrowserContext) {
  // Only the sign-in cookies go; the browser id cookie is never removed, so no request can mint a new one.
  await ctx.clearCookies({ name: /better-auth/ });
}

test("store filters by tag and price", async ({ page }) => {
  await page.goto("/ht/store");
  await page.getByRole("button", { name: /^Filtre/ }).click();
  await page.getByRole("button", { name: /PC/ }).click();
  await page.waitForURL(/tag=PC/);
  await expect(page.locator('a[href$="/products/steam-wallet-card"]').first()).toBeVisible();
  await expect(page.locator('a[href$="/products/netflix-subscription"]')).toHaveCount(0);

  await page.goto("/ht/store");
  await page.getByRole("button", { name: /^Filtre/ }).click();
  await page.getByLabel(/Pri maksimòm/).fill("200");
  await page.waitForURL(/max=200/);
  await expect(page.locator('a[href$="/products/free-fire-diamonds"]').first()).toBeVisible();
  await expect(page.locator('a[href$="/products/google-play-gift-card"]')).toHaveCount(0);
});

test("store: live search with typos, list view and favorites", async ({ page }) => {
  await page.goto("/ht/store");
  await page.getByRole("searchbox").pressSequentially("netflx");
  await expect(page.locator('a[href$="/products/netflix-subscription"]').first()).toBeVisible();
  await expect(page.locator('a[href$="/products/free-fire-diamonds"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ou vle di «netflix»/ })).toBeVisible();
  await page.waitForURL(/q=netflx/);
  await page.getByRole("button", { name: "Efase rechèch la" }).click();
  await expect(page.locator('a[href$="/products/free-fire-diamonds"]').first()).toBeVisible();

  await page.getByRole("button", { name: "Lis" }).click();
  await page.getByRole("button", { name: "Mete nan favori" }).first().click();
  await page.reload();
  await expect(page.getByRole("button", { name: "Lis" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /Favori/ }).first().click();
  await expect(page.locator('a[href*="/products/"]')).toHaveCount(1);
});

test("sign in ↔ create account switches without a page load", async ({ page }) => {
  await page.goto("/es/auth/login");
  await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
  await page.getByRole("link", { name: "Crear cuenta" }).first().click();
  await expect(page.locator("#name")).toBeVisible();
  await expect(page).toHaveURL(/\/es\/auth\/register/);
  expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
  await page.goBack();
  await expect(page.locator("#name")).toHaveCount(0);
});

test("admin: manual method, subcategory, page, menu, announcement, media, security, email", async ({ browser }) => {
  const a = await newPage(browser);
  await staffLogin(a);

  // Extra manual payment method (asks for the authenticator code: answered by the helper)
  await a.goto("/admin/payment-methods");
  await a.waitForLoadState("networkidle");
  const form = a.locator("form", { hasText: "New manual method" });
  await form.locator('input[name="code"]').fill(methodCode);
  await form.locator('input[name="recipientName"]').fill("Haiti Gaming SA");
  await form.locator('input[name="recipientNumber"]').fill("001-234-567");
  await form.locator('input[name="name_ht"]').fill(methodName);
  await form.locator('textarea[name="instructions_ht"]').fill("Fè yon virman labank.");
  await form.getByRole("button", { name: "Create method" }).click();
  await expect(a.getByText(`Method: ${methodCode}`)).toBeVisible();

  // Subcategory under "Game top-ups"
  await a.goto("/admin/products");
  await a.waitForLoadState("networkidle");
  const cat = a.locator("form", { hasText: "New category" });
  await cat.locator('input[name="slug"]').fill(subSlug);
  await cat.locator('input[name="name_ht"]').fill(`Sou-kat ${stamp}`);
  const parent = await cat.locator('select[name="parentId"] option', { hasText: "Game top-ups" }).getAttribute("value");
  await cat.locator('select[name="parentId"]').selectOption(parent!);
  await cat.getByRole("button", { name: "Create" }).click();
  await expect(a.locator(`input[name=slug][value="${subSlug}"]`)).toHaveCount(1);

  // Custom page built from blocks
  await a.goto("/admin/pages/new");
  await a.waitForLoadState("networkidle");
  await a.getByLabel("Slug (address)").fill(pageSlug);
  await a.getByLabel("Title (HT)").fill(`Paj pwomo ${stamp}`);
  await a.getByRole("button", { name: "+ Heading" }).click();
  await a.getByLabel("Heading").last().fill("Gwo rabè");
  await a.getByRole("button", { name: "+ Text" }).click();
  await a.getByLabel("Text", { exact: true }).last().fill("Tout kat yo an rabè semèn sa a.");
  await a.getByLabel("Published").check();
  await a.getByLabel("Link in footer").check();
  await a.getByRole("button", { name: "Save page" }).click();
  await a.waitForURL(/\/admin\/pages\/c/);

  // Header menu: start from the standard menu and add the new page
  await a.goto("/admin/navigation");
  await a.waitForLoadState("networkidle");
  const start = a.getByRole("button", { name: "Start from the standard menu" });
  if (await start.isVisible()) await start.click();
  await a.getByRole("button", { name: "+ Add link" }).first().click();
  await a.getByLabel("Link address").last().fill(`/p/${pageSlug}`);
  await a.getByLabel("Label ht").last().fill("Pwomo");
  await a.getByRole("button", { name: "Publish navigation" }).click();
  await expect(a.getByText("Navigation published")).toBeVisible();

  // Announcement bar
  await a.goto("/admin/settings");
  await a.waitForLoadState("networkidle");
  await a.getByLabel("Show announcement").check();
  await a.getByLabel(/Newsletter sign-up form/).check();
  await a.getByLabel("Text (HT)").fill(announcement);
  await a.getByLabel("Show from (optional)").fill("");
  await a.getByLabel("Hide after (optional)").fill("");
  await a.getByRole("button", { name: "Save settings" }).click();
  await expect(a.getByText("Settings saved")).toBeVisible();

  // Media library lists uploaded images and refuses to delete one in use
  await a.goto("/admin/media");
  await a.waitForLoadState("networkidle");
  await a.getByRole("button", { name: "Find existing images" }).click();
  await expect(a.getByText(/image\(s\) added/)).toBeVisible();
  await a.reload();
  const tiles = a.getByTestId("media-tile");
  if ((await tiles.count()) > 0) {
    const used = tiles.filter({ has: a.locator('img[src*="/products/"]') }).first();
    if (await used.count()) {
      await used.getByRole("button", { name: "Delete" }).click();
      await expect(used.getByText(/Still used by/)).toBeVisible();
    }
  }

  // Security and email screens
  await a.goto("/admin/security");
  await expect(a.getByRole("heading", { name: "Staff sessions" })).toBeVisible();
  await expect(a.getByText("this session")).toBeVisible();
  await expect(a.getByText("Database", { exact: true })).toBeVisible();
  await a.goto("/admin/email");
  await expect(a.getByText("Email is off.")).toBeVisible();
  await expect(a.locator('iframe[title="Email preview"]')).toBeVisible();
});

test("customer: announcement, menu, custom page, newsletter, manual deposit, reconciliation, shared browser", async ({ browser, request }) => {
  const c = await newPage(browser);
  await c.goto("/ht");
  await c.waitForLoadState("networkidle");

  // Announcement shows and stays dismissed
  await expect(c.getByText(announcement)).toBeVisible();
  await c.getByRole("button", { name: "Fèmen" }).first().click();
  await expect(c.getByText(announcement)).toHaveCount(0);
  await c.reload();
  await expect(c.getByText(announcement)).toHaveCount(0);

  // Menu link and footer link to the custom page
  await expect(c.locator(`footer a[href$="/p/${pageSlug}"]`)).toHaveCount(1);
  await c.goto(`/ht/p/${pageSlug}`);
  await expect(c.getByRole("heading", { name: "Gwo rabè" })).toBeVisible();
  await expect(c.getByText("Tout kat yo an rabè semèn sa a.")).toBeVisible();

  // Subcategory chip on the parent category
  await c.goto("/ht/categories/game-top-ups");
  await expect(c.getByRole("link", { name: new RegExp(`Sou-kat ${stamp}`) })).toBeVisible();

  // Newsletter
  await c.goto("/ht");
  await c.getByPlaceholder("Imèl ou").fill(`nouvel.${stamp}@example.com`);
  await c.getByRole("button", { name: "Enskri" }).click();
  await expect(c.getByText("Mèsi! Ou enskri.")).toBeVisible();

  // Two accounts on the same browser
  const first = `premye.${stamp}@example.com`;
  await registerCustomer(c, "Premye Kont", first, "Premye-Kont-2026!");
  await signOutKeepDevice(c.context());
  const second = `dezyem.${stamp}@example.com`;
  await registerCustomer(c, "Dezyèm Kont", second, "Dezyem-Kont-2026!");

  // Deposit with the new manual method
  await c.goto("/ht/account/wallet/deposit");
  await c.waitForLoadState("networkidle");
  await c.getByRole("tab", { name: new RegExp(methodName) }).click();
  await expect(c.getByText("Fè yon virman labank.")).toBeVisible();
  await c.getByLabel("Montan (HTG)").fill("1500");
  await c.getByLabel(new RegExp(`Referans tranzaksyon ${methodName}`)).fill(manualRef);
  await c.getByRole("button", { name: "Voye depo a" }).click();
  await expect(c.getByText(/Depo a voye/)).toBeVisible();

  // Checkout with the manual method: the order page shows its instructions and asks for the reference
  await c.goto("/ht/products/google-play-gift-card");
  await c.getByRole("button", { name: "Achte kounye a" }).click();
  await c.waitForURL("**/ht/cart");
  await c.getByRole("link", { name: "Peye" }).click();
  await c.waitForURL("**/ht/checkout");
  await c.locator("label", { hasText: methodName }).click();
  await c.getByRole("button", { name: "Pase kòmand lan" }).click();
  await c.waitForURL("**/ht/account/orders/**");
  await expect(c.getByText("Fè yon virman labank.")).toBeVisible();
  await expect(c.getByLabel(new RegExp(`Referans tranzaksyon ${methodName}`))).toBeVisible();

  // Staff: reconcile a statement and approve the matching payment
  const a = await newPage(browser);
  await staffLogin(a);
  await a.goto("/admin/reconciliation");
  await a.waitForLoadState("networkidle");
  await a.getByLabel("Provider").selectOption({ label: methodCode });
  await a.locator("textarea").fill(`reference,amount,date\n${manualRef},1500,2026-10-14\nUNKNOWN999,700,2026-10-14`);
  await a.getByRole("button", { name: "Compare" }).click();
  await expect(a.getByText("2 statement lines read.")).toBeVisible();
  await expect(a.locator("li", { hasText: "UNKNOWN999" })).toBeVisible();
  await a.getByRole("button", { name: "Approve" }).click();
  await expect(a.getByText(/Approved/)).toBeVisible();

  // Customer page shows the account that shares the browser
  await a.goto(`/admin/customers?q=${encodeURIComponent(second)}`);
  await a.getByRole("link", { name: "Dezyèm Kont" }).click();
  await expect(a.getByText("same browser", { exact: true }).first()).toBeVisible();
  await expect(a.getByRole("link", { name: new RegExp(first) })).toBeVisible();

  // Wallet now holds the deposit
  await c.goto("/ht/account/wallet");
  await expect(c.getByText(/1[\s,. ]?500/).first()).toBeVisible();

  // Health check
  const h = await request.get("/api/health");
  expect(h.status()).toBe(200);
  expect(await h.json()).toEqual({ ok: true, db: "up" });
  void admin;
});
