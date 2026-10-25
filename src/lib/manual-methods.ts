import { prisma } from "./db";
import { t } from "./text";

export type ManualMethodView = {
  id: string; name: string; instructions: string; recipientName: string; recipientNumber: string; logo: string | null;
  kind: "mobile" | "crypto"; network: string | null; qrImage: string | null; currency: "HTG" | "USD";
};

/** Enabled extra manual payment methods (Admin → Payment methods), localized for display. */
export async function getManualMethods(locale: string, use: "orders" | "deposits"): Promise<ManualMethodView[]> {
  const rows = await prisma.manualMethod.findMany({
    where: { isEnabled: true, ...(use === "orders" ? { allowOrders: true } : { allowDeposits: true }) },
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((m) => ({ id: m.id, name: t(m.name, locale) || m.code, instructions: t(m.instructions, locale), recipientName: m.recipientName, recipientNumber: m.recipientNumber, logo: m.logo,
    kind: m.kind === "crypto" ? "crypto" : "mobile", network: m.network, qrImage: m.qrImage, currency: m.currency,
  }));
}
