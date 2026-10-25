import { fullTheme, type ThemeConfig } from "./settings";
import { darken, mix } from "./color";

const HEX = /^#[0-9a-fA-F]{6}$/;

function rgba(hex: string, alpha: number) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(2)})`;
}

/**
 * CSS variables for the published theme (Admin → Appearance).
 * Light values on :root, dark values on .dark; components only ever use the variables.
 */
export function themeCss(theme: Partial<ThemeConfig> | undefined): string {
  const t = fullTheme(theme);
  if (![t.primary, t.primaryDark, t.navy, t.midnight, t.lightBg].every((c) => HEX.test(c))) return "";
  const g = Math.max(0, Math.min(100, t.glow)) / 100;
  const radius = Math.max(0, Math.min(28, Math.round(t.radius)));
  return [
    `:root{--bg:${t.lightBg};--surface-2:${mix(t.primary, t.lightBg, 0.05)};--border:${mix(t.primary, t.lightBg, 0.1)};` +
      `--primary:${t.primary};--primary-hover:${darken(t.primary)};--primary-soft:${mix(t.primary, "#ffffff", 0.1)};` +
      `--navy:${t.navy};--midnight:${t.midnight};--radius-card:${radius}px;--glow:${rgba(t.primary, 0.45 * g)};--glow-strength:${g}}`,
    `.dark{--bg:${t.midnight};--surface:${t.navy};--surface-2:${mix("#ffffff", t.navy, 0.05)};--border:${mix("#ffffff", t.navy, 0.1)};` +
      `--primary:${t.primaryDark};--primary-hover:${mix(t.primaryDark, "#ffffff", 0.85)};--primary-soft:${mix(t.primaryDark, t.midnight, 0.2)};` +
      `--glow:${rgba(t.primaryDark, 0.55 * g)}}`,
    `.card{border-radius:${radius}px}`,
  ].join("");
}

/** Attributes for <html>: motion style, heading font, hero grid. Motion is "off" when animations are switched off. */
export function themeAttrs(theme: Partial<ThemeConfig> | undefined) {
  const t = fullTheme(theme);
  return {
    "data-motion": t.animations ? t.motion : "off",
    "data-font": t.displayFont,
    "data-grid": t.heroGrid ? "on" : "off",
  };
}

/** Runs before paint: the visitor's own choice wins, else the store's default mode. */
export function themeScript(defaultMode: "dark" | "light", key = "hv_theme") {
  // The visitor's choice wins ("light", "dark", or "system" = follow the phone); it is also copied into a cookie so the
  // server can render the right theme next time.
  return `try{var t=localStorage.getItem('${key}');var d=t==='system'?matchMedia('(prefers-color-scheme: dark)').matches:t?t==='dark':${defaultMode === "dark"};document.documentElement.classList.toggle('dark',d);if(t&&document.cookie.indexOf('${key}=')<0)document.cookie='${key}='+t+'; path=/; max-age=31536000; samesite=lax'}catch(e){}`;
}

/**
 * After a new deploy the previous design file is deleted. Safari can bring back a tab from memory that still asks for
 * the old file, and the page shows without any design. If the stylesheet marker (--hv-css, in globals.css) is missing
 * once the page has loaded, reload once to get the current files. At most once a minute, so it can never loop.
 */
export const cssGuardScript = `(function(){function c(){try{if(getComputedStyle(document.documentElement).getPropertyValue('--hv-css').trim())return;var k='hv_css_reload',l=+sessionStorage.getItem(k)||0;if(Date.now()-l<60000)return;sessionStorage.setItem(k,String(Date.now()));location.reload()}catch(e){}}if(document.readyState==='complete')setTimeout(c,0);else addEventListener('load',function(){setTimeout(c,0)});addEventListener('pageshow',function(e){if(e.persisted)setTimeout(c,0)})})()`;
