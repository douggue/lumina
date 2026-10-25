/**
 * What customers see about a choice before ordering (the details card on the order screen): quality, speed, start
 * time, drop rate, location and the cancel button. Filled from the provider's own words when a choice is linked
 * (Admin → Services & risk), then editable there. Shared by the server and the order screen.
 */
export type Quality = "real" | "mixed" | "hq" | "bot";
export type Drop = "none" | "low" | "yes";
export type ServiceInfo = {
  quality?: Quality;
  /** "300K" (per day) */
  speed?: string;
  /** "instant", "0-5 min", "12-24 h" */
  start?: string;
  drop?: Drop;
  /** "Global", "USA"… */
  location?: string;
  cancel?: boolean;
};

const LOCATIONS = ["Global", "Worldwide", "USA", "Brazil", "India", "Europe", "Arab", "Turkey", "Russia", "France", "Canada", "Haiti", "Latin", "Africa", "Asia"];

/** Reads the provider's service name and description. Unknown parts stay empty. */
export function infoFromProvider(name: string, desc?: string | null, cancel?: boolean): ServiceInfo {
  const text = `${name} ${desc ?? ""}`;
  const low = text.toLowerCase();
  const info: ServiceInfo = {};

  if (/\bbots?\b|\bfake\b/.test(low)) info.quality = "bot";
  else if (/\breal\b/.test(low) && /\bmix(ed)?\b/.test(low)) info.quality = "mixed";
  else if (/\b(real|active|organic)\b/.test(low)) info.quality = "real";
  else if (/\bmix(ed)?\b/.test(low)) info.quality = "mixed";
  else if (/\b(hq|high quality|premium)\b/.test(low)) info.quality = "hq";

  const speed = /(\d[\d.,]*\s*[km]?(?:\s*[-–]\s*\d[\d.,]*\s*[km]?)?)\s*\/\s*(?:day|d)\b/i.exec(text) ?? /speed:?\s*(?:day\s*)?(\d[\d.,]*\s*[km]?(?:\s*[-–]\s*\d[\d.,]*\s*[km]?)?)/i.exec(text);
  if (speed) info.speed = speed[1].replace(/\s+/g, "").replace(/–/g, "-").toUpperCase();

  if (/\binstant(\s*start)?\b/i.test(text) && !/\bnot instant\b/i.test(text)) info.start = "instant";
  const start = /(\d+\s*[-–]\s*\d+|\d+)\s*(hours?|hrs?|h|minutes?|mins?|m)\b\s*(?:start)?/i.exec(/start[^|\]]*/i.exec(text)?.[0] ?? "") ?? /(\d+\s*[-–]\s*\d+|\d+)\s*(hours?|hrs?|h|minutes?|mins?)\s*start/i.exec(text);
  if (start) info.start = `${start[1].replace(/\s+/g, "").replace(/–/g, "-")} ${/^h/i.test(start[2]) ? "h" : "min"}`;

  if (/\b(non|no|zero)[\s-]?drop\b|\bnondrop\b/.test(low)) info.drop = "none";
  else if (/\blow[\s-]?drop\b/.test(low)) info.drop = "low";
  else if (/\bdrop\b/.test(low)) info.drop = "yes";

  const loc = LOCATIONS.find((l) => new RegExp(`\\b${l}\\b`, "i").test(text));
  if (loc) info.location = loc === "Worldwide" ? "Global" : loc;
  if (cancel !== undefined) info.cancel = cancel;
  return info;
}

/** Keeps only known values (admin form and stored JSON are never trusted as is). */
export function cleanInfo(v: unknown): ServiceInfo {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim().slice(0, 40) : undefined);
  const out: ServiceInfo = {};
  if (["real", "mixed", "hq", "bot"].includes(o.quality as string)) out.quality = o.quality as Quality;
  if (["none", "low", "yes"].includes(o.drop as string)) out.drop = o.drop as Drop;
  if (str(o.speed)) out.speed = str(o.speed);
  if (str(o.start)) out.start = str(o.start);
  if (str(o.location)) out.location = str(o.location);
  if (typeof o.cancel === "boolean") out.cancel = o.cancel;
  return out;
}
