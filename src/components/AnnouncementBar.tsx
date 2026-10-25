import type { Settings } from "@/lib/settings";
import { t } from "@/lib/text";
import { DismissibleBar } from "./DismissibleBar";

/** Shown only inside its optional start/end window (Haiti time as entered in admin); visitors can dismiss it. */
export function AnnouncementBar({ settings, locale }: { settings: Settings; locale: string }) {
  const a = settings.announcement;
  const text = a?.enabled ? t(a.text, locale) : "";
  if (!text) return null;
  const now = Date.now();
  const at = (v?: string) => (v ? Date.parse(v.length === 16 ? `${v}:00-04:00` : v) : NaN);
  if (a.startsAt && at(a.startsAt) > now) return null;
  if (a.endsAt && at(a.endsAt) < now) return null;
  return <DismissibleBar id={`${text}|${a.link}`} text={text} link={a.link} />;
}
