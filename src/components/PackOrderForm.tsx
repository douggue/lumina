"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { placePackOrder } from "@/actions/service-order";
import { formatMoney } from "@/lib/money";
import { withDiscount } from "@/lib/vip-math";
import { splitEvenly } from "@/lib/pack-math";

type Line = { name: string; quantity: number; post: boolean; min: number; avg: string };

/**
 * Starter pack order: one profile link (followers) and the videos for likes and views, one link per line.
 * The likes/views are spread evenly; each video's share must stay above the provider's minimum (maxVideos).
 */
export function PackOrderForm(p: {
  slug: string; signedIn: boolean; balance: number | null; discount: number; price: number; separate: number; discountPct: number;
  newOnly: boolean; maxVideos: number; high: boolean; available: boolean; profileExample: string; videoExample: string; lines: Line[];
}) {
  const t = useTranslations("packUi");
  const locale = useLocale();
  const router = useRouter();
  const [profile, setProfile] = useState("");
  const [videos, setVideos] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const fmt = (n: number) => formatMoney(n, "HTG", locale);
  const needsProfile = p.lines.some((l) => !l.post);
  const needsVideos = p.lines.some((l) => l.post);
  const list = [...new Set(videos.split("\n").map((x) => x.trim()).filter(Boolean))];
  const tooMany = list.length > p.maxVideos;
  const total = withDiscount(p.price, p.discount);
  const short = p.balance !== null && total > p.balance;
  const ready = p.signedIn && p.available && (!needsProfile || profile.trim()) && (!needsVideos || (list.length > 0 && !tooMany)) && isPublic && (!p.high || accepted) && !short;
  const submit = () =>
    start(async () => {
      setError("");
      const r = await placePackOrder({ slug: p.slug, profileLink: profile, videoLinks: list.join("\n"), publicOk: isPublic, acceptRisk: accepted });
      if (r.ok) router.push(`/account/orders/${r.orderId}`);
      else setError(t.has(`error_${r.error}`) ? t(`error_${r.error}`, { max: p.maxVideos }) : t("error_generic"));
    });
  const field = "rounded-xl border border-border bg-surface px-3.5 text-base";
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 px-5 pb-8 pt-4">
      <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.6px] text-muted">{t("inside")}</h2>
        {p.lines.map((l) => (
          <div key={l.name} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">{l.name}</span>
            <span className="flex-none font-bold">{l.quantity.toLocaleString("en-US")}</span>
          </div>
        ))}
        <div className="my-1 h-px bg-border" />
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm text-muted">{t("separately")} <s className="text-muted">{fmt(p.separate)}</s></span>
          <span className="rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success">-{p.discountPct}%</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-text">{t("packPrice")}</span>
          <span className="text-lg font-extrabold text-text">{fmt(p.price)}</span>
        </div>
        {p.newOnly && <p className="text-xs text-muted">{t("newOnly")}</p>}
      </section>

      {needsProfile && (
        <section className="flex flex-col gap-2">
          <label htmlFor="profile" className="text-sm font-semibold">{t("profileLabel")}</label>
          <input id="profile" value={profile} onChange={(e) => setProfile(e.target.value)} placeholder={p.profileExample} autoComplete="off" className={`${field} h-[50px]`} />
          <p className="text-xs text-muted">{t("profileHint")}</p>
        </section>
      )}

      {needsVideos && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <label htmlFor="videos" className="text-sm font-semibold">{t("videosLabel")}</label>
            <span className={`text-[13px] font-bold ${tooMany ? "text-danger" : ""}`}>{t("videoCount", { n: list.length, max: p.maxVideos })}</span>
          </div>
          <textarea id="videos" rows={4} value={videos} onChange={(e) => setVideos(e.target.value)} placeholder={`${p.videoExample}\n${p.videoExample}`} className={`${field} py-3 leading-normal`} />
          <p className="text-xs text-muted">{t("videosHint", { max: p.maxVideos })}</p>
          {list.length > 0 && !tooMany && (
            <div className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3 text-[13px]">
              <span className="font-bold">{t("split", { n: list.length })}</span>
              {p.lines.filter((l) => l.post).map((l) => {
                const parts = splitEvenly(l.quantity, list.length);
                return <span key={l.name}>{l.name}: {parts[0] === parts[parts.length - 1] ? t("each", { q: parts[0].toLocaleString("en-US") }) : t("eachRange", { a: parts[parts.length - 1].toLocaleString("en-US"), b: parts[0].toLocaleString("en-US") })}</span>;
              })}
            </div>
          )}
        </section>
      )}

      <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 text-[13px] leading-normal">
        <input type="checkbox" checked={isPublic} onChange={() => setIsPublic((v) => !v)} className="m-0 h-[22px] w-[22px] flex-none accent-text" />
        <span>{t("publicConfirm")}</span>
      </label>
      {p.high && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border-2 border-danger/40 bg-danger-soft p-3.5 text-[13px] leading-normal text-danger">
          <input type="checkbox" checked={accepted} onChange={() => setAccepted((a) => !a)} className="m-0 h-[22px] w-[22px] flex-none accent-danger" />
          <span>{t("riskAccept")}</span>
        </label>
      )}

      <section className="flex items-baseline justify-between rounded-2xl border border-border bg-surface p-4">
        <span className="text-[15px] font-bold">{t("total")}{p.discount > 0 ? ` (VIP -${p.discount}%)` : ""}</span>
        <span className="text-2xl font-extrabold">{fmt(total)}</span>
      </section>
      {short && <p className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{t("short")} <Link href="/account/wallet" className="font-bold underline">{t("addFunds")}</Link></p>}
      {!p.available && <p className="rounded-[10px] bg-warning-soft px-3 py-2.5 text-[13px] text-warning">{t("unavailable")}</p>}
      {error && <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>}
      {p.signedIn ? (
        <button type="button" onClick={submit} disabled={!ready || pending}
          className={`flex h-[54px] items-center justify-center rounded-[14px] text-base font-bold ${ready && !pending ? "bg-text text-surface" : "bg-surface-2 text-muted"}`}>
          {pending ? t("sending") : t("confirm", { total: fmt(total) })}
        </button>
      ) : (
        <Link href={`/auth/login?next=/order/pack/${p.slug}`} className="flex h-[54px] items-center justify-center rounded-[14px] bg-text text-base font-bold text-surface">{t("signIn")}</Link>
      )}
      <p className="text-center text-xs leading-normal text-muted">{t("autoRefund")}</p>
    </div>
  );
}
