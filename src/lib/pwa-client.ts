/** Browser helpers for the installed app (client only). */
export function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
export function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
/** Facebook, Instagram, TikTok… browsers can't add to the home screen. */
export function isInAppBrowser() {
  return /FBAN|FBAV|Instagram|Line\/|TikTok|Snapchat|WhatsApp|musical_ly|BytedanceWebview/i.test(navigator.userAgent);
}
export const INSTALL_EVENT = "hv:install";
