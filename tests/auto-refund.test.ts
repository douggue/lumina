import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { getBalances, post, systemAccount, walletAccount } from "@/lib/ledger";
import { chargeOrder } from "@/lib/wallet";

process.env.CRON_SECRET = "test-secret";
afterAll(() => prisma.$disconnect());

async function paidOrder(hoursAgo: number) {
  const user = await prisma.user.create({ data: { id: `u_${Math.random().toString(36).slice(2)}`, name: "Refund Test", email: `${Math.random()}@t.test` } });
  await prisma.$transaction(async (tx) => {
    const w = await walletAccount(tx, user.id, "HTG");
    const c = await systemAccount(tx, "clearing", "HTG", "test");
    await post(tx, { type: "DEPOSIT", idempotencyKey: `f:${user.id}`, description: "t", entries: [{ accountId: c.id, currency: "HTG", amount: -500_00 }, { accountId: w.id, currency: "HTG", amount: 500_00 }] });
  });
  const category = await prisma.category.upsert({ where: { slug: "test-cat" }, create: { slug: "test-cat", name: { en: "Test" } }, update: {} });
  const product = await prisma.product.create({ data: { slug: `p-${Math.random().toString(36).slice(2)}`, categoryId: category.id, name: { en: "P" }, description: {}, isPublished: true, variants: { create: { name: { en: "V" }, priceHtg: 300_00 } } }, include: { variants: true } });
  const order = await prisma.order.create({
    data: {
      userId: user.id, currency: "HTG", subtotal: 300_00, total: 300_00, paymentMethod: "WALLET", accessToken: `t${Math.random()}`, status: "PROCESSING",
      paidAt: new Date(Date.now() - hoursAgo * 3_600_000),
      items: { create: { variantId: product.variants[0].id, productName: { en: "P" }, variantName: { en: "V" }, quantity: 1, unitPrice: 300_00 } },
    },
  });
  await prisma.$transaction((tx) => chargeOrder(tx, order));
  return { order, userId: user.id };
}

describe("automatic refund of undelivered orders", () => {
  it("refunds orders older than autoRefundHours and leaves recent ones", async () => {
    const old = await paidOrder(120); // older than the default autoRefundHours (96)
    const recent = await paidOrder(1);
    expect((await getBalances(prisma, old.userId)).HTG.available).toBe(200_00);
    const { GET } = await import("@/app/api/cron/maintenance/route");
    const res = await GET(new Request("http://x/api/cron/maintenance", { headers: { authorization: "Bearer test-secret" } }) as never);
    expect(res.status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: old.order.id } })).status).toBe("REFUNDED");
    expect((await getBalances(prisma, old.userId)).HTG.available).toBe(500_00);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: recent.order.id } })).status).toBe("PROCESSING");
  });

  it("refuses calls without the cron secret", async () => {
    const { GET } = await import("@/app/api/cron/maintenance/route");
    const res = await GET(new Request("http://x/api/cron/maintenance") as never);
    expect(res.status).toBe(401);
  });
});
