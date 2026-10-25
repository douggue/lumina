import { test, expect } from "@playwright/test";
import { registerCustomer } from "./helpers";

/** Installable app: manifest, iPhone launch screens, notifications toggle, service worker push → notification. */
test("manifest and iPhone launch screens", async ({ page, request }) => {
  const m = await (await request.get("/manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  expect(m.shortcuts).toHaveLength(3);
  await page.goto("/ht");
  const splash = page.locator('link[rel="apple-touch-startup-image"]');
  expect(await splash.count()).toBeGreaterThan(10);
  expect((await request.get((await splash.first().getAttribute("href"))!)).ok()).toBe(true);
});

test("customer sees the notifications toggle, and a push shows a notification", async ({ page, context }) => {
  await registerCustomer(page, "Rose Pierre", `rose.${Date.now()}@example.com`, "Kliyan-Push-2026!");
  await page.goto("/ht/account/notifications");
  await expect(page.getByRole("heading", { name: "Notifikasyon sou telefòn ou" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aktive notifikasyon" })).toBeVisible();

  // The service worker turns a push into a notification.
  await context.grantPermissions(["notifications"]);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const cdp = await context.newCDPSession(page);
  await cdp.send("ServiceWorker.enable");
  const reg = await new Promise<{ registrationId: string }>((resolve) =>
    cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => e.registrations[0] && resolve(e.registrations[0])),
  );
  await cdp.send("ServiceWorker.deliverPushMessage", {
    origin: new URL(page.url()).origin,
    registrationId: reg.registrationId,
    data: JSON.stringify({ title: "Haiti Gaming", body: "Kòmand #1001 livre.", url: "/ht/account/orders", tag: "order_fulfilled" }),
  });
  await expect
    .poll(() => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => n.body)))
    .toContain("Kòmand #1001 livre.");
});
