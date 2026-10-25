import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getBalances, InsufficientFundsError, post, systemAccount, UnbalancedTransactionError, walletAccount } from "@/lib/ledger";
import { chargeOrder, creditPayment, postExchange, quoteExchange } from "@/lib/wallet";

let userId: string;

async function newUser() {
  const u = await prisma.user.create({ data: { id: `u_${Math.random().toString(36).slice(2)}`, name: "Test", email: `${Math.random()}@t.test` } });
  return u.id;
}

async function fund(uid: string, amount: number, key = `fund:${Math.random()}`) {
  return prisma.$transaction(async (tx) => {
    const wallet = await walletAccount(tx, uid, "HTG");
    const clearing = await systemAccount(tx, "clearing", "HTG", "test");
    return post(tx, { type: "DEPOSIT", idempotencyKey: key, description: "test", entries: [
      { accountId: clearing.id, currency: "HTG", amount: -amount },
      { accountId: wallet.id, currency: "HTG", amount },
    ] });
  });
}

beforeAll(async () => {
  userId = await newUser();
});
afterAll(() => prisma.$disconnect());

describe("ledger postings", () => {
  it("credits a wallet with a balanced transaction", async () => {
    await fund(userId, 100_00);
    const b = await getBalances(prisma, userId);
    expect(b.HTG.available).toBe(100_00);
  });

  it("is idempotent: the same key posts once", async () => {
    const uid = await newUser();
    const key = `same-key-${uid}`;
    const a = await fund(uid, 50_00, key);
    const b = await fund(uid, 50_00, key);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect((await getBalances(prisma, uid)).HTG.available).toBe(50_00);
  });

  it("rejects unbalanced transactions in code", async () => {
    await expect(
      prisma.$transaction(async (tx) => {
        const w = await walletAccount(tx, userId, "HTG");
        return post(tx, { type: "ADJUSTMENT", idempotencyKey: `bad:${Math.random()}`, description: "x", entries: [{ accountId: w.id, currency: "HTG", amount: 10 }] });
      }),
    ).rejects.toBeInstanceOf(UnbalancedTransactionError);
  });

  it("rejects unbalanced transactions in the database (deferred trigger)", async () => {
    const w = await prisma.$transaction((tx) => walletAccount(tx, userId, "HTG"));
    await expect(
      prisma.$transaction(async (tx) => {
        const t = await tx.ledgerTransaction.create({ data: { type: "ADJUSTMENT", idempotencyKey: `raw:${Math.random()}`, description: "raw" } });
        await tx.ledgerEntry.create({ data: { transactionId: t.id, accountId: w.id, currency: "HTG", amount: 999 } });
      }),
    ).rejects.toThrow(/not balanced/);
  });

  it("refuses to let a wallet go negative", async () => {
    const uid = await newUser();
    await fund(uid, 10_00);
    const order = await prisma.order.create({ data: { userId: uid, currency: "HTG", subtotal: 20_00, total: 20_00, paymentMethod: "WALLET", accessToken: `t${Math.random()}` } });
    await expect(prisma.$transaction((tx) => chargeOrder(tx, order))).rejects.toBeInstanceOf(InsufficientFundsError);
    expect((await getBalances(prisma, uid)).HTG.available).toBe(10_00);
  });

  it("serializes concurrent charges so only what is available is spent", async () => {
    const uid = await newUser();
    await fund(uid, 100_00);
    const orders = await Promise.all(
      [1, 2, 3].map(() => prisma.order.create({ data: { userId: uid, currency: "HTG", subtotal: 60_00, total: 60_00, paymentMethod: "WALLET", accessToken: `t${Math.random()}` } })),
    );
    const results = await Promise.allSettled(orders.map((o) => prisma.$transaction((tx) => chargeOrder(tx, o))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getBalances(prisma, uid)).HTG.available).toBe(40_00);
  });

  it("keeps the ledger append-only", async () => {
    const e = await prisma.ledgerEntry.findFirstOrThrow();
    await expect(prisma.ledgerEntry.update({ where: { id: e.id }, data: { amount: 1 } })).rejects.toThrow(/append-only/);
    await expect(prisma.ledgerEntry.delete({ where: { id: e.id } })).rejects.toThrow(/append-only/);
  });

  it("credits a payment intent exactly once", async () => {
    const uid = await newUser();
    const intent = await prisma.paymentIntent.create({ data: { userId: uid, provider: "MONCASH", amount: 25_00, status: "SUCCEEDED" } });
    await prisma.$transaction((tx) => creditPayment(tx, intent, { hold: false }));
    await prisma.$transaction((tx) => creditPayment(tx, intent, { hold: false }));
    expect((await getBalances(prisma, uid)).HTG.available).toBe(25_00);
  });

  it("can hold a deposit separately from the spendable balance", async () => {
    const uid = await newUser();
    const intent = await prisma.paymentIntent.create({ data: { userId: uid, provider: "NATCASH", amount: 300_00, status: "SUCCEEDED", providerRef: `R${Math.random()}` } });
    await prisma.$transaction((tx) => creditPayment(tx, intent, { hold: true }));
    const b = await getBalances(prisma, uid);
    expect(b.HTG).toEqual({ available: 0, held: 300_00 });
  });
});

describe("exchange", () => {
  const s = { htgPerUsd: 130, exchangeSpreadBps: 100, exchangeFeeBps: 0 };

  it("applies the spread against the customer in both directions", () => {
    const toUsd = quoteExchange("HTG", 1313_00, s); // 1313 HTG at 131.3 → $10.00
    expect(toUsd).toMatchObject({ to: "USD", toAmount: 10_00 });
    const toHtg = quoteExchange("USD", 10_00, s); // $10 at 128.7 → 1287 HTG
    expect(toHtg).toMatchObject({ to: "HTG", toAmount: 1287_00 });
  });

  it("posts a four-leg exchange that balances in each currency", async () => {
    const uid = await newUser();
    await fund(uid, 1313_00);
    const q = await prisma.exchangeQuote.create({
      data: { userId: uid, fromCurrency: "HTG", toCurrency: "USD", fromAmount: 1313_00, toAmount: 10_00, rate: new Prisma.Decimal(131.3), feeAmount: 0, expiresAt: new Date(Date.now() + 60_000) },
    });
    await prisma.$transaction((tx) => postExchange(tx, q));
    const b = await getBalances(prisma, uid);
    expect(b.HTG.available).toBe(0);
    expect(b.USD.available).toBe(10_00);
  });
});
