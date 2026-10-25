/** WCAG 2.x relative luminance and contrast ratio for #RRGGBB colors. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

/** Slightly darker shade for hover states. */
export function darken(hex: string, amount = 0.12) {
  const ch = [1, 3, 5].map((i) => Math.max(0, Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount))));
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Very light tint (light mode) or dark tint (dark mode) for soft backgrounds. */
export function mix(hex: string, withHex: string, weight: number) {
  const a = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const b = [1, 3, 5].map((i) => parseInt(withHex.slice(i, i + 2), 16));
  return `#${a.map((v, i) => Math.round(v * weight + b[i] * (1 - weight)).toString(16).padStart(2, "0")).join("")}`;
}
