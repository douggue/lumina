import { Prisma, type Currency, type LedgerAccountType, type LedgerTxType } from "@prisma/client";
import type { Tx } from "./db";

export class InsufficientFundsError extends Error {
  constructor() {
    super("Insufficient wallet balance");
  }
}

export class UnbalancedTransactionError extends Error {}

const SYSTEM_ACCOUNTS: Record<string, { type: LedgerAccountType; allowNegative: boolean }> = {
  clearing: { type: "CLEARING", allowNegative: true },
  revenue: { type: "REVENUE", allowNegative: true },
  fx: { type: "FX", allowNegative: true },
  adjustment: { type: "ADJUSTMENT", allowNegative: true },
};

export async function walletAccount(tx: Tx, userId: string, currency: Currency) {
  const code = `wallet:${userId}:${currency}`;
  return tx.ledgerAccount.upsert({
    where: { code },
    create: { code, type: "CUSTOMER_WALLET", currency, userId },
    update: {},
  });
}

/** Referral earnings (withdrawable to MonCash / NatCash), separate from the spend-only wallet. */
export async function earningsAccount(tx: Tx, userId: string) {
  const code = `earnings:${userId}:HTG`;
  return tx.ledgerAccount.upsert({
    where: { code },
    create: { code, type: "CUSTOMER_EARNINGS", currency: "HTG", userId },
    update: {},
  });
}

export async function heldAccount(tx: Tx, userId: string, currency: Currency) {
  const code = `held:${userId}:${currency}`;
  return tx.ledgerAccount.upsert({
    where: { code },
    create: { code, type: "CUSTOMER_HELD", currency, userId },
    update: {},
  });
}

/** System accounts, e.g. systemAccount(tx, "clearing", "HTG", "moncash") → code "clearing:moncash:HTG". */
export async function systemAccount(tx: Tx, kind: keyof typeof SYSTEM_ACCOUNTS, currency: Currency, sub?: string) {
  const code = sub ? `${kind}:${sub}:${currency}` : `${kind}:${currency}`;
  const def = SYSTEM_ACCOUNTS[kind];
  return tx.ledgerAccount.upsert({
    where: { code },
    create: { code, type: def.type, currency, allowNegative: def.allowNegative },
    update: {},
  });
}

export type Posting = {
  type: LedgerTxType;
  idempotencyKey: string;
  description: string;
  createdById?: string | null;
  metadata?: Record<string, unknown>;
  entries: { accountId: string; currency: Currency; amount: number }[];
};

/**
 * Post a balanced transaction. Must run inside prisma.$transaction.
 * Returns { duplicate: true } without changes when the idempotency key was already used.
 */
export async function post(tx: Tx, p: Posting): Promise<{ id: string; duplicate: boolean }> {
  const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey: p.idempotencyKey } });
  if (existing) return { id: existing.id, duplicate: true };

  const sums = new Map<Currency, number>();
  for (const e of p.entries) {
    if (!Number.isSafeInteger(e.amount) || e.amount === 0) throw new UnbalancedTransactionError("Entry amounts must be non-zero integers");
    sums.set(e.currency, (sums.get(e.currency) ?? 0) + e.amount);
  }
  for (const [cur, sum] of sums) {
    if (sum !== 0) throw new UnbalancedTransactionError(`Transaction not balanced in ${cur}: ${sum}`);
  }

  // Lock touched accounts in a stable order to serialize concurrent postings and avoid deadlocks.
  const ids = [...new Set(p.entries.map((e) => e.accountId))].sort();
  const locked = await tx.$queryRaw<{ id: string; balance: number; allowNegative: boolean }[]>`
    SELECT id, balance, "allowNegative" FROM "LedgerAccount" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
  for (const acct of locked) {
    const delta = p.entries.filter((e) => e.accountId === acct.id).reduce((s, e) => s + e.amount, 0);
    if (!acct.allowNegative && acct.balance + delta < 0) throw new InsufficientFundsError();
  }

  const created = await tx.ledgerTransaction.create({
    data: {
      type: p.type,
      idempotencyKey: p.idempotencyKey,
      description: p.description,
      createdById: p.createdById ?? null,
      metadata: (p.metadata ?? {}) as Prisma.InputJsonValue,
      entries: { create: p.entries.map((e) => ({ accountId: e.accountId, currency: e.currency, amount: e.amount })) },
    },
  });

  for (const e of p.entries) {
    try {
      await tx.ledgerAccount.update({ where: { id: e.accountId }, data: { balance: { increment: e.amount } } });
    } catch (err) {
      if (String(err).includes("ledger_account_non_negative")) throw new InsufficientFundsError();
      throw err;
    }
  }
  return { id: created.id, duplicate: false };
}

export type Balances = Record<Currency, { available: number; held: number }>;

export async function getBalances(tx: Tx, userId: string): Promise<Balances> {
  const accounts = await tx.ledgerAccount.findMany({ where: { userId } });
  const b: Balances = { HTG: { available: 0, held: 0 }, USD: { available: 0, held: 0 } };
  for (const a of accounts) {
    if (a.type === "CUSTOMER_WALLET") b[a.currency].available = a.balance;
    if (a.type === "CUSTOMER_HELD") b[a.currency].held = a.balance;
  }
  return b;
}
