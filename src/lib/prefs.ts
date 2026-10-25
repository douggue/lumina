import "server-only";
import { cookies } from "next/headers";
import type { Currency } from "@prisma/client";
import { getUser } from "./session";

export const CURRENCY_COOKIE = "hv_currency";

/** Display currency: the visitor's own choice (cookie, then profile), otherwise HTG for everyone. */
export async function getDisplayCurrency(): Promise<Currency> {
  const c = (await cookies()).get(CURRENCY_COOKIE)?.value;
  if (c === "HTG" || c === "USD") return c;
  const user = await getUser();
  if (user?.displayCurrency) return user.displayCurrency;
  return "HTG";
}
