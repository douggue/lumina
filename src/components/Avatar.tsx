/* eslint-disable @next/next/no-img-element */
const COLORS = ["#1467F5", "#D21034", "#7C3AED", "#0E9F6E", "#E8590C", "#0891B2", "#DB2777", "#4F46E5"];

/** "Jean-Pierre Louis" → "JL" */
export function initials(name: string) {
  const words = name.trim().split(/[\s-]+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

function colorFor(name: string) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

/** Round avatar: the Google photo if the customer has one, else their initials on a color picked from the name (same color everywhere). */
export function Avatar({ name, image, size = 32, className = "" }: { name: string; image?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (image && /^https:\/\//.test(image)) {
    return <img src={image} alt="" width={size} height={size} referrerPolicy="no-referrer" className={`shrink-0 rounded-full object-cover ${className}`} style={style} />;
  }
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${className}`} style={{ ...style, background: colorFor(name) }}>
      {initials(name)}
    </span>
  );
}
