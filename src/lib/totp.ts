import { createHmac } from "node:crypto";

/**
 * RFC 6238 TOTP (SHA-1, 30 s, 6 digits) from a Base32 secret.
 * Used for the customer "2FA code" tool on account orders (YTSeller delivers secrets in login lines).
 * No extra dependency — Node crypto only.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** Decode a Base32 (RFC 4648) secret; ignores spaces and padding. */
export function decodeBase32(input: string): Buffer | null {
  const cleaned = input.replace(/[\s=_-]+/g, "").toUpperCase();
  if (!cleaned || /[^A-Z2-7]/.test(cleaned)) return null;
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) return null;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((value >>> bits) & 0xff);
    }
  }
  return out.length ? Buffer.from(out) : null;
}

/** Pull a Base32 TOTP secret from a delivered account line (otpauth URL or trailing token). */
export function extractTotpSecret(line: string): string | null {
  const fromUrl = /[?&]secret=([A-Za-z2-7=]+)/i.exec(line);
  if (fromUrl) {
    const s = fromUrl[1].replace(/=+$/, "").toUpperCase();
    if (s.length >= 16) return s;
  }
  const tokens = line.split(/[:|\t/,;\s]+/).map((t) => t.trim()).filter(Boolean);
  for (let i = tokens.length - 1; i >= 0; i--) {
    const s = tokens[i].replace(/[\s=_-]+/g, "").toUpperCase();
    if (/^[A-Z2-7]{16,64}$/.test(s) && decodeBase32(s)) return s;
  }
  return null;
}

/** Current 6-digit TOTP and seconds until it rolls. Null if the secret is unusable. */
export function generateTotp(secretBase32: string, now = Date.now()): { code: string; expiresIn: number } | null {
  const key = decodeBase32(secretBase32);
  if (!key || key.length < 10) return null;
  const step = 30;
  const counter = Math.floor(now / 1000 / step);
  const expiresIn = step - (Math.floor(now / 1000) % step);
  const buf = Buffer.alloc(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    buf[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hmac = createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const bin =
    ((hmac[offset]! & 0x7f) << 24) |
    ((hmac[offset + 1]! & 0xff) << 16) |
    ((hmac[offset + 2]! & 0xff) << 8) |
    (hmac[offset + 3]! & 0xff);
  return { code: String(bin % 1_000_000).padStart(6, "0"), expiresIn };
}
