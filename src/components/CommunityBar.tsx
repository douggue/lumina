import type { Settings } from "@/lib/settings";

type Item = { key: string; label: string; url: string; color: string; path: React.ReactNode };

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/**
 * Community links bar: WhatsApp channel, Telegram, social pages and review sites, as a row of round icons.
 * Links are set in Admin → Settings; an icon shows only when it has a link. Nothing renders when none is set.
 */
export function CommunityBar({ settings, label, className = "" }: { settings: Settings; label: string; className?: string }) {
  const items: Item[] = [
    { key: "wa", label: "WhatsApp", url: settings.socialWhatsappChannel, color: "#16A34A", path: <path {...stroke} d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5z" /> },
    { key: "tg", label: "Telegram", url: settings.socialTelegram, color: "#229ED9", path: <path {...stroke} d="M21.5 4.5 2.5 11.8l6.3 2.1 2.3 6.6 3.4-4.4 5 3.7z M8.8 13.9 18 7.5" /> },
    { key: "fb", label: "Facebook", url: settings.socialFacebook, color: "#1877F2", path: <path {...stroke} d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /> },
    { key: "tt", label: "TikTok", url: settings.socialTiktok, color: "currentColor", path: <path {...stroke} d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.5 2.5 4.5 5 4.5" /> },
    { key: "ig", label: "Instagram", url: settings.socialInstagram, color: "#C13584", path: <g {...stroke}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.6" /></g> },
    { key: "yt", label: "YouTube", url: settings.socialYoutube, color: "#DC2626", path: <g {...stroke}><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="m10 9 5 3-5 3z" /></g> },
    { key: "gr", label: "Google", url: settings.reviewsGoogle, color: "#4285F4", path: <path {...stroke} d="M20.5 12.2c0 4.8-3.3 8.3-8.3 8.3a8.5 8.5 0 1 1 5.7-14.8M20.5 12.2H12.3" /> },
    { key: "tp", label: "Trustpilot", url: settings.reviewsTrustpilot, color: "#00B67A", path: <path {...stroke} d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5l-5.3 2.9 1.2-6-4.5-4.1 6-.7z" /> },
  ].filter((i) => i.url);
  if (!items.length) return null;
  return (
    <nav aria-label={label} className={`flex flex-wrap items-center justify-around gap-2 rounded-2xl border border-border bg-surface-2 px-3 py-2 ${className}`}>
      {items.map((i) => (
        <a key={i.key} href={i.url} target="_blank" rel="noopener noreferrer" aria-label={i.label} title={i.label}
          className="grid h-11 w-11 place-items-center rounded-full text-text hover:bg-surface" style={{ color: i.color }}>
          <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>{i.path}</svg>
        </a>
      ))}
    </nav>
  );
}
