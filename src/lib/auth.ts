import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins";
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "./db";
import { emailEnabled, sendPasswordResetEmail, sendVerificationEmail } from "./email";
import { isPasswordBreached } from "./password-check";
import { recordReferral } from "./referrals";
import { recordDevice } from "./devices";
import { verifyTurnstile } from "./turnstile";
import { onSiteDomain, ownDomain, siteUrl } from "./site-url";

// Argon2id parameters (OWASP recommended minimums)
const argonOpts = { memoryCost: 19456, timeCost: 2, parallelism: 1, algorithm: 2 as const };
const site = () => siteUrl();

type AuthUser = { email: string; name: string; locale?: string | null };

// Sign-in also works from Vercel preview URLs and any extra origins listed in TRUSTED_ORIGINS (comma-separated).
const trustedOrigins = [
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ...(process.env.VERCEL_BRANCH_URL ? [`https://${process.env.VERCEL_BRANCH_URL}`] : []),
  ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
  ...(process.env.NEXT_PUBLIC_SITE_URL ? [process.env.NEXT_PUBLIC_SITE_URL] : []),
  // The own domain with and without "www."
  ...(ownDomain() ? [ownDomain()!, ownDomain()!.replace("://www.", "://")] : []),
  ...(process.env.TRUSTED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean),
];

/** "Continue with Google" is offered only when both Google keys are set in Vercel. */
export const googleEnabled = () => !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const auth = betterAuth({
  appName: "HaitiViral",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Customers can always sign in; verification is encouraged once email is configured, not forced.
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => {
      const u = user as AuthUser;
      await sendPasswordResetEmail(u, `${site()}/${u.locale ?? "ht"}/auth/reset?token=${token}`);
    },
    password: {
      // Every new password (sign-up, reset, change) is checked against known data breaches before hashing.
      hash: async (password) => {
        if (await isPasswordBreached(password)) {
          throw APIError.from("BAD_REQUEST", { code: "PASSWORD_COMPROMISED", message: "This password appeared in a data breach. Choose a different one." });
        }
        return hash(password, argonOpts);
      },
      verify: ({ hash: hashed, password }) => verify(hashed, password),
    },
  },
  emailVerification: {
    sendOnSignUp: emailEnabled(),
    autoSignInAfterVerification: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      // The link must open on haitiviral.com even if the customer signed up on the .vercel.app address.
      await sendVerificationEmail(user as AuthUser, onSiteDomain(url));
    },
  },
  socialProviders: googleEnabled()
    ? { google: { clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, prompt: "select_account" } }
    : {},
  account: {
    // Google with the same (Google-verified) email signs into the existing account instead of making a second one.
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  user: {
    additionalFields: {
      role: { type: "string", input: false, defaultValue: "CUSTOMER" },
      status: { type: "string", input: false, defaultValue: "ACTIVE" },
      locale: { type: "string", input: true, defaultValue: "ht" },
      displayCurrency: { type: "string", input: true, defaultValue: "HTG" },
      phone: { type: "string", input: true, required: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  hooks: {
    // Bot check on the forms bots attack (no-op until Turnstile keys are set).
    before: createAuthMiddleware(async (ctx) => {
      if (!["/sign-up/email", "/sign-in/email", "/request-password-reset"].includes(ctx.path)) return;
      if (!ctx.request) return; // server-side calls (first-run setup, scripts) have no browser to challenge
      const h = ctx.headers;
      const ip = h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
      if (!(await verifyTurnstile(h?.get("x-turnstile-token"), ip))) {
        throw APIError.from("BAD_REQUEST", { code: "CAPTCHA_FAILED", message: "Bot check failed. Please try again." });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Link the new account to the friend who invited them (cookie set from ?ref=CODE links).
        after: async (user, ctx) => {
          try {
            const h = (ctx as { headers?: Headers; request?: Request } | null)?.headers ?? (ctx as { request?: Request } | null)?.request?.headers;
            const cookie = h?.get("cookie") ?? "";
            const code = /(?:^|;\s*)hv_ref=([A-Z0-9]{6,12})/i.exec(cookie)?.[1];
            const ip = h?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
            await recordReferral(user.id, code, ip);
          } catch (e) {
            console.error("referral link failed", e);
          }
        },
      },
    },
    session: {
      create: {
        // Suspended or closed accounts are refused at sign-in, not after.
        before: async (session, ctx) => {
          const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { status: true, role: true } });
          if (u && (u.status === "SUSPENDED" || u.status === "CLOSED")) {
            throw APIError.from("FORBIDDEN", { code: "ACCOUNT_BLOCKED", message: "This account is not active." });
          }
          // Staff must sign in with password + 2FA code: Google sign-in would skip the code.
          if (u && u.role !== "CUSTOMER" && (ctx as { path?: string } | null)?.path?.startsWith("/callback/")) {
            throw APIError.from("FORBIDDEN", { code: "STAFF_PASSWORD_ONLY", message: "Staff accounts sign in with email and password." });
          }
        },
        // Remember the browser for multi-account detection. Never blocks sign-in.
        after: async (session, ctx) => {
          try {
            const h = (ctx as { headers?: Headers; request?: Request } | null)?.headers ?? (ctx as { request?: Request } | null)?.request?.headers;
            const device = /(?:^|;\s*)hv_dev=([A-Za-z0-9_-]{16,64})/.exec(h?.get("cookie") ?? "")?.[1] ?? null;
            await recordDevice(session.userId, device, session.ipAddress ?? null, session.userAgent ?? null);
          } catch (e) {
            console.error("device record failed", e);
          }
        },
      },
    },
  },
  rateLimit: {
    // Only for automated test runs where every sign-in comes from one address. Never set this in production.
    enabled: process.env.AUTH_RATE_LIMIT !== "off",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/request-password-reset": { window: 300, max: 3 },
      "/reset-password": { window: 60, max: 5 },
      "/send-verification-email": { window: 300, max: 3 },
      "/two-factor/verify-totp": { window: 60, max: 5 },
      "/two-factor/verify-backup-code": { window: 60, max: 5 },
    },
  },
  advanced: {
    ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
  },
  plugins: [twoFactor({ issuer: "HaitiViral" }), nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;
