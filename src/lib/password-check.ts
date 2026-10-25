import { createHash } from "node:crypto";

/**
 * Checks a password against the Have I Been Pwned breach list using k-anonymity:
 * only the first 5 characters of its SHA-1 hash leave the server.
 * Fails open (returns false) if the service is slow or unreachable, so sign-up never depends on it.
 */
export async function isPasswordBreached(password: string): Promise<boolean> {
  if (process.env.PASSWORD_BREACH_CHECK === "off") return false;
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split("\n").some((line) => {
      const [hash, count] = line.trim().split(":");
      return hash === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}
