/**
 * Cloudflare Turnstile bot check (free). Off until both keys are set:
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY (shown in the page) and TURNSTILE_SECRET_KEY (server only).
 * When off, every check passes so the site works the same as before.
 */
export function turnstileEnabled(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

export async function verifyTurnstile(token: string | null | undefined, ip?: string | null): Promise<boolean> {
  if (!turnstileEnabled()) return true;
  if (!token || token.length > 2048) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY!, response: token });
    if (ip) body.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (e) {
    // Cloudflare unreachable: fail open rather than lock every customer out. Rate limits still apply.
    console.error("Turnstile verify failed", e);
    return true;
  }
}
