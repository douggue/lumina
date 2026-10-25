/**
 * Phone numbers (client + server). Stored as "+50934567890"; shown as "+509 3456 7890".
 * Haiti is the default: "34567890", "3456-7890", "509 3456 7890" and "+509 3456 7890" are all the same number.
 * Anything else must start with "+" and the country code (Dominican Republic, US, Canada, France, Chile…).
 */
export const HAITI = "509";

function digits(s: string) {
  return s.replace(/\D/g, "");
}

/** "+50934567890", or null if it isn't a usable number. */
export function normalizePhone(input: string | null | undefined): string | null {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  let d = digits(raw);
  if (raw.startsWith("00")) d = d.slice(2);
  const international = raw.startsWith("+") || raw.startsWith("00");
  if (!international) {
    if (d.length === 8) d = HAITI + d;
    else if (!(d.length === 11 && d.startsWith(HAITI))) return null;
  }
  if (d.startsWith(HAITI)) return d.length === 11 ? `+${d}` : null;
  return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
}

/** Display: "+509 3456 7890", "+1 809 555 1234", other countries in groups of 3. */
export function formatPhone(input: string | null | undefined): string {
  const raw = String(input ?? "");
  const d = digits(raw);
  if (!d) return raw.startsWith("+") ? "+" : "";
  if (d.startsWith(HAITI)) {
    const n = d.slice(3, 11);
    return `+509${n ? " " + n.slice(0, 4) : ""}${n.length > 4 ? " " + n.slice(4) : ""}`;
  }
  if (d.startsWith("1")) {
    const n = d.slice(1, 11);
    return ["+1", n.slice(0, 3), n.slice(3, 6), n.slice(6)].filter(Boolean).join(" ");
  }
  const cc = d.length > 2 ? d.slice(0, 2) : d;
  const rest = d.slice(cc.length, 15);
  return `+${cc}${rest ? " " + (rest.match(/.{1,3}/g) ?? []).join(" ") : ""}`;
}

/** What the field shows while typing: Haiti unless the customer started with "+" and another country code. */
export function typePhone(input: string): string {
  let raw = input.trimStart();
  // A full number pasted after the "+509 " already in the field: keep the pasted one.
  const lastPlus = raw.lastIndexOf("+");
  if (lastPlus > 0) raw = raw.slice(lastPlus);
  let d = digits(raw);
  if (d.startsWith(HAITI + HAITI) && d.length > 11) {
    d = d.slice(3);
    raw = `+${d}`;
  }
  if (!d) return raw.startsWith("+") ? "+" : "";
  if (raw.startsWith("+") && !d.startsWith(HAITI) && !HAITI.startsWith(d)) return formatPhone(raw);
  if (raw.startsWith("+") && HAITI.startsWith(d)) return `+${d}`;
  const local = d.startsWith(HAITI) && d.length > 8 ? d.slice(3) : d.startsWith(HAITI) && raw.startsWith("+") ? d.slice(3) : d;
  return formatPhone(HAITI + local.slice(0, 8));
}

/** For wa.me links: digits only. */
export function waNumber(phone: string | null | undefined) {
  return digits(normalizePhone(phone) ?? "");
}
