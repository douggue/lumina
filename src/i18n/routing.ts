import { defineRouting } from "next-intl/routing";

export const locales = ["ht", "fr"] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: "ht",
  localePrefix: "always",
});

export const localeNames: Record<Locale, string> = {
  ht: "Kreyòl",
  fr: "Français",
};
