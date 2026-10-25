import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { ownDomain } from "./lib/site-url";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

// Locale resolution: saved cookie → visitors in Haiti get Kreyòl → Accept-Language → Kreyòl.
// Phones in Haiti are usually set to French or English, so the phone language alone would rarely pick Kreyòl.
// Referral links (?ref=CODE) are remembered for 30 days so the invite counts when the friend signs up later.
export default function middleware(req: NextRequest) {
  // Once the own domain is connected, the live site has one address: send visitors of the .vercel.app address there (same page).
  const own = ownDomain();
  if (own && process.env.VERCEL_ENV === "production" && req.nextUrl.hostname.endsWith(".vercel.app")) {
    return NextResponse.redirect(new URL(req.nextUrl.pathname + req.nextUrl.search, own), 308);
  }
  const res = intl(inHaitiWithoutChoice(req) ? withLanguage(req, "ht") : req);
  const ref = req.nextUrl.searchParams.get("ref");
  if (ref && /^[A-Z0-9]{6,12}$/i.test(ref)) {
    res.cookies.set("hv_ref", ref.toUpperCase(), { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax", httpOnly: true });
  }
  // Anonymous browser id, used only to spot several accounts created from one device.
  if (!req.cookies.get("hv_dev")) {
    res.cookies.set("hv_dev", crypto.randomUUID().replace(/-/g, ""), { path: "/", maxAge: 60 * 60 * 24 * 400, sameSite: "lax", httpOnly: true, secure: req.nextUrl.protocol === "https:" });
  }
  // The saved language (NEXT_LOCALE) is written only when the visitor picks one (saveLocalePreference).
  // next-intl would also write it on every page response, including the background prefetch of each
  // language flag, so the last flag prefetched would silently become the saved language.
  // Last step: the cookies set above rewrite the header.
  dropLocaleCookie(res);
  return res;
}

/** Vercel sets x-vercel-ip-country from the visitor's address. A saved language (NEXT_LOCALE cookie) always wins. */
function inHaitiWithoutChoice(req: NextRequest) {
  return req.headers.get("x-vercel-ip-country") === "HT" && !req.cookies.get("NEXT_LOCALE");
}

function dropLocaleCookie(res: Response) {
  const kept = res.headers.getSetCookie().filter((c) => !c.startsWith("NEXT_LOCALE="));
  res.headers.delete("set-cookie");
  for (const c of kept) res.headers.append("set-cookie", c);
}

function withLanguage(req: NextRequest, lang: string) {
  const headers = new Headers(req.headers);
  headers.set("accept-language", lang);
  return new NextRequest(req.url, { headers, method: req.method });
}

export const config = {
  matcher: ["/((?!api|admin|media|_next|_vercel|.*\\..*).*)"],
};
