/** Cities offered to customers (profile, sign-up) and in Admin → Trust. Free text is not allowed so the popup stays clean. */
export const CITIES: { name: string; flag: string }[] = [
  { name: "Pòtoprens", flag: "🇭🇹" },
  { name: "Petyonvil", flag: "🇭🇹" },
  { name: "Dèlma", flag: "🇭🇹" },
  { name: "Kafou", flag: "🇭🇹" },
  { name: "Tabarre", flag: "🇭🇹" },
  { name: "Okap", flag: "🇭🇹" },
  { name: "Gonayiv", flag: "🇭🇹" },
  { name: "Senmak", flag: "🇭🇹" },
  { name: "Jakmèl", flag: "🇭🇹" },
  { name: "Okay", flag: "🇭🇹" },
  { name: "Jeremi", flag: "🇭🇹" },
  { name: "Pòdepè", flag: "🇭🇹" },
  { name: "Fò Libète", flag: "🇭🇹" },
  { name: "Ench", flag: "🇭🇹" },
  { name: "Miragwàn", flag: "🇭🇹" },
  { name: "Leogàn", flag: "🇭🇹" },
  { name: "Santo Domingo", flag: "🇩🇴" },
  { name: "Santiago (RD)", flag: "🇩🇴" },
  { name: "Punta Cana", flag: "🇩🇴" },
  { name: "Miami", flag: "🇺🇸" },
  { name: "New York", flag: "🇺🇸" },
  { name: "Boston", flag: "🇺🇸" },
  { name: "Orlando", flag: "🇺🇸" },
  { name: "Montréal", flag: "🇨🇦" },
  { name: "Paris", flag: "🇫🇷" },
  { name: "Santiago (Chili)", flag: "🇨🇱" },
  { name: "São Paulo", flag: "🇧🇷" },
];

export function cityFlag(city: string | null | undefined): string {
  return CITIES.find((c) => c.name === city)?.flag ?? "🌎";
}

export function isCity(city: unknown): city is string {
  return typeof city === "string" && CITIES.some((c) => c.name === city);
}
