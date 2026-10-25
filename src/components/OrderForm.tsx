"use client";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { placeServiceOrder } from "@/actions/service-order";
import { formatMoney } from "@/lib/money";
import { withDiscount } from "@/lib/vip-math";
import {
  checkLink, isShortLink, DRIP_INTERVAL_MIN, DRIP_RUNS, LIVE_DURATIONS, linkExample, parseComments, servicePrice, wantsPost,
  type Kind, type Risk, type ServiceMeta,
} from "@/lib/services";

export type OrderCatalog = {
  slug: string;
  name: string;
  letter: string;
  color: string;
  image: string | null;
  services: { kind: Kind; tiers: { id: string; name: string; rate: number; soldOut: boolean; meta: ServiceMeta }[] }[];
}[];

const RISK_COLOR: Record<Risk, string> = { low: "#16A34A", med: "#D97706", high: "#DC2626" };
const num = (n: number) => n.toLocaleString("en-US");

/** Rounded chip: dark when selected (mockup "pill"). */
const pill = (on: boolean) =>
  `min-h-11 rounded-full border px-3.5 text-sm font-bold transition-colors ${on ? "border-text bg-text text-surface" : "border-border bg-surface text-text"}`;

export type ServiceUpdateView = { id: string; kind: string; text: string; at: string };

export function OrderForm({ catalog, balance, signedIn, initial, discount = 0, updates = [] }: {
  catalog: OrderCatalog;
  updates?: ServiceUpdateView[];
  balance: number | null;
  signedIn: boolean;
  initial: { platform?: string; kind?: string; tier?: number };
  /** VIP discount in % (applied again on the server) */
  discount?: number;
}) {
  const t = useTranslations("orderForm");
  const locale = useLocale();
  const router = useRouter();
  const [platformSlug, setPlatformSlug] = useState(catalog.find((c) => c.slug === initial.platform)?.slug ?? catalog[0]?.slug ?? "");
  const platform = catalog.find((c) => c.slug === platformSlug) ?? catalog[0];
  const [kindPick, setKindPick] = useState<string | undefined>(initial.kind);
  const service = platform?.services.find((s) => s.kind === kindPick) ?? platform?.services[0];
  const [tierPick, setTierPick] = useState(initial.tier ?? 1);
  const tier = service?.tiers[Math.min(tierPick, (service?.tiers.length ?? 1) - 1)];

  const [link, setLink] = useState("");
  const [qty, setQty] = useState("1000");
  const [dur, setDur] = useState(30);
  const [drip, setDrip] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [comments, setComments] = useState("");
  const [username, setUsername] = useState("");
  const [sheet, setSheet] = useState<null | "drip" | "risk">(null);
  const [tab, setTab] = useState<"info" | "read" | "updates">("info");
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (!platform || !service || !tier) {
    return <div className="container-page py-16 text-center text-muted">{t("empty")}</div>;
  }
  const meta = tier.meta;
  const hasComments = meta.type === "comments" || meta.type === "liveComments";
  const isLive = meta.type === "live";
  const liveAny = isLive || meta.type === "liveComments";
  const post = wantsPost(service.kind, meta.type);
  const commentList = parseComments(comments);
  const quantity = hasComments ? commentList.length : Number(qty) || 0;
  const total = withDiscount(servicePrice(tier.rate, quantity, meta.type, dur), discount);
  const check = link.trim() ? checkLink(link, platform.slug, post, meta.postType) : null;
  const linkError = check && !check.ok ? t(`err_${check.error === "empty" ? "not_platform" : check.error}`, { platform: platform.name, example: linkExample(platform.slug, post) }) : "";
  const shortHint = check?.ok && isShortLink(check.url, platform.slug) ? t("shortLinkHint") : "";
  const linkOk = check?.ok && !shortHint ? (liveAny ? t("okLive") : post ? t("okPost") : t("okProfile")) : "";
  const rangeError = hasComments
    ? quantity < meta.min ? t("minComments", { min: meta.min }) : quantity > meta.max ? t("range", { min: num(meta.min), max: num(meta.max) }) : ""
    : quantity < meta.min || quantity > meta.max ? t("range", { min: num(meta.min), max: num(meta.max) }) : "";
  const short = balance !== null && total > balance;
  const isHigh = meta.risk === "high";
  const ready = signedIn && check?.ok && !rangeError && !short && (!isHigh || accepted) && isPublic && (meta.type !== "commentLikes" || username.trim().length > 0) && !tier.soldOut;
  const chips = meta.min >= 500 ? [1000, 5000, 10000, 50000] : [100, 500, 1000, 5000];
  const fmt = (n: number) => formatMoney(n, "HTG", locale);
  const priceLabel = hasComments ? `${(tier.rate / 100 / 1000).toFixed(2)} HTG` : fmt(tier.rate);
  const durLabel = (m: number) => (m >= 60 ? t("hours", { n: m / 60 }) : t("minutes", { n: m }));

  const pickTier = (i: number) => {
    setTierPick(i);
    setAccepted(false);
  };
  const submit = () => {
    setError("");
    start(async () => {
      const r = await placeServiceOrder({
        variantId: tier.id,
        link,
        quantity,
        comments: hasComments ? comments : undefined,
        username: meta.type === "commentLikes" ? username : undefined,
        durationMin: isLive ? dur : undefined,
        drip: meta.drip && drip,
        acceptRisk: accepted,
        publicOk: isPublic,
      });
      if (r.ok) router.push(`/account/orders/${r.orderId}`);
      else if (r.error.startsWith("link_")) setError(t(`err_${r.error.slice(5)}`, { platform: platform.name, example: linkExample(platform.slug, post) }));
      else setError(t.has(`error_${r.error}`) ? t(`error_${r.error}`) : t("error_generic"));
    });
  };
  const sheets = {
    drip: { title: t("dripSheetTitle"), text: t("dripSheetText"), example: t("dripSheetExample") },
    risk: { title: t("riskSheetTitle"), text: t("riskSheetText"), example: t("riskSheetExample") },
  };
  const info = sheet ? sheets[sheet] : null;

  return (
    <div className="relative mx-auto w-full max-w-[560px] bg-bg pb-7">
      <div className="flex flex-col gap-[18px] px-5 pt-4">
        {/* 1 · Platform and service kind */}
        <section className="flex flex-col gap-2.5">
          <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {catalog.map((p) => {
              const on = p.slug === platform.slug;
              return (
                <button key={p.slug} type="button" aria-pressed={on} className={`${pill(on)} flex flex-none items-center gap-1.5 pl-1.5 pr-3`}
                  onClick={() => { setPlatformSlug(p.slug); setTierPick(1); setAccepted(false); }}>
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="h-[26px] w-[26px] rounded-lg object-cover" />
                  ) : (
                    <span className="grid h-[26px] w-[26px] place-items-center rounded-lg text-[10px] font-extrabold text-white" style={{ background: p.color }}>{p.letter}</span>
                  )}
                  {p.name}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {platform.services.map((s) => {
              const on = s.kind === service.kind;
              return (
                <button key={s.kind} type="button" aria-pressed={on} onClick={() => { setKindPick(s.kind); setTierPick(1); setAccepted(false); }}
                  className={`min-h-[38px] rounded-[10px] border-2 px-3.5 text-[13px] font-bold ${on ? "border-text bg-primary-soft text-text" : "border-border bg-surface text-text/80"}`}>
                  {t(`kind_${s.kind}`)}
                </button>
              );
            })}
          </div>
        </section>

        {/* 2 · Three choices */}
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-bold uppercase tracking-[0.6px] text-muted">{t("chooseQuality")}</h2>
            <button type="button" onClick={() => setSheet("risk")} className="min-h-9 px-1 text-xs font-bold text-cyan">{t("whatRisk")}</button>
          </div>
          {service.tiers.map((x, i) => {
            const on = x.id === tier.id;
            const per = x.meta.type === "comments" || x.meta.type === "liveComments" ? t("perComment") : x.meta.type === "live" ? t("per1000live") : t("per1000");
            const price = x.meta.type === "comments" || x.meta.type === "liveComments" ? `${(x.rate / 100 / 1000).toFixed(2)} HTG` : fmt(x.rate);
            return (
              <div key={x.id} className={`flex items-stretch rounded-[14px] border-2 bg-surface ${on ? "border-text shadow-[0_0_0_3px_#E2E8F0] dark:shadow-none" : "border-border"} ${x.soldOut ? "opacity-50" : ""}`}>
                <button type="button" aria-pressed={on} disabled={x.soldOut} onClick={() => pickTier(i)} className="flex min-w-0 flex-1 flex-col gap-1.5 py-3 pl-3.5 text-left">
                  <span className="flex items-center gap-2">
                    <span className="text-[15px] font-extrabold">{x.name}</span>
                    <span aria-hidden className="h-[9px] w-[9px] rounded-full" style={{ background: RISK_COLOR[x.meta.risk] }} />
                    <span className="text-xs text-muted">{t(`risk_${x.meta.risk}`)}</span>
                  </span>
                  <span className="text-xs text-muted">
                    {t("avg", { time: x.meta.avg[locale] ?? "" })}
                    {x.meta.refillDays ? ` · ${t("refill", { days: x.meta.refillDays })}` : ""}
                  </span>
                </button>
                <button type="button" onClick={() => pickTier(i)} tabIndex={-1} aria-hidden className="flex flex-col items-end justify-center gap-0.5 pl-2 pr-1">
                  <span className="whitespace-nowrap text-[15px] font-extrabold">{price}</span>
                  <span className="whitespace-nowrap text-[11px] text-muted">{per}</span>
                </button>
                <button type="button" onClick={() => { pickTier(i); setTab("info"); document.getElementById("service-details")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} aria-label={t("details", { name: x.name })} className="grid w-11 flex-none place-items-center text-muted">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
                </button>
              </div>
            );
          })}
        </section>

        {/* Before ordering: the choice's details, what to know, and service news (tabs) */}
        <ServiceDetails id="service-details" tab={tab} setTab={setTab} meta={meta} post={post} live={liveAny} locale={locale} updates={updates} />

        {/* 3 · Details */}
        <section className="flex flex-col gap-2.5">
          <label htmlFor="link" className="text-sm font-semibold">{liveAny ? t("linkLive") : post ? t("linkPost") : t("linkProfile")}</label>
          <input id="link" type="url" inputMode="url" autoComplete="off" value={link} onChange={(e) => setLink(e.target.value)} placeholder={linkExample(platform.slug, post)}
            className={`h-[50px] rounded-xl bg-surface px-3.5 text-base ${linkError ? "border-2 border-danger" : linkOk ? "border-2 border-success" : "border border-border"}`} />
          {linkError && <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] leading-normal text-danger">{linkError}</p>}
          {shortHint && <p className="rounded-[10px] bg-warning-soft px-3 py-2.5 text-[13px] text-warning">{shortHint}</p>}
          {linkOk && <p className="rounded-[10px] bg-success-soft px-3 py-2.5 text-[13px] text-success">{linkOk}</p>}
          {liveAny && !linkError && <p className="text-xs text-muted">{t("liveLinkHint")}</p>}

          {!hasComments && (
            <>
              <label htmlFor="qty" className="mt-1 text-sm font-semibold">{t("quantity")}</label>
              <input id="qty" type="number" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)}
                className="h-[50px] rounded-xl border border-border bg-surface px-3.5 text-base" />
              <div className="grid grid-cols-4 gap-2">
                {chips.map((n) => (
                  <button key={n} type="button" onClick={() => setQty(String(n))} className={`${pill(quantity === n)} px-0`}>{n >= 1000 ? `${n / 1000}k` : n}</button>
                ))}
              </div>
            </>
          )}

          {isLive && (
            <>
              <div className="mt-1 text-sm font-semibold">{t("howLong")}</div>
              <div className="grid grid-cols-4 gap-2">
                {LIVE_DURATIONS.map((m) => (
                  <button key={m} type="button" onClick={() => setDur(m)} className={`${pill(dur === m)} px-0`}>{m >= 60 ? t("hours", { n: m / 60 }) : t("minutes", { n: m })}</button>
                ))}
              </div>
            </>
          )}

          {hasComments && (
            <>
              <div className="mt-1 flex items-center justify-between">
                <label htmlFor="comments" className="text-sm font-semibold">{t("commentsLabel")}</label>
                <span className="text-[13px] font-bold">{t("commentsCount", { n: commentList.length })}</span>
              </div>
              <textarea id="comments" rows={5} value={comments} onChange={(e) => setComments(e.target.value)}
                className="rounded-xl border border-border bg-surface px-3.5 py-3 text-base leading-normal" />
              {commentList.length === 1 && commentList[0].includes(",") && (
                <button type="button" onClick={() => setComments(commentList[0].split(",").map((s) => s.trim()).filter(Boolean).join("\n"))}
                  className="min-h-11 rounded-xl border border-[#F59E0B] bg-[#FFFBEB] text-[13px] font-bold text-[#92400E]">{t("splitCommas")}</button>
              )}
              <div className="flex flex-wrap gap-1.5">
                {t("presets").split("|").map((p) => (
                  <button key={p} type="button" onClick={() => setComments((c) => (c.trim() ? `${c.replace(/\s+$/, "")}\n` : "") + p)}
                    className="min-h-[38px] rounded-full border border-dashed border-[#94A3B8] bg-surface px-3 text-[13px] font-semibold">+ {p}</button>
                ))}
              </div>
            </>
          )}

          {meta.type === "commentLikes" && (
            <>
              <label htmlFor="uname" className="mt-1 text-sm font-semibold">{t("commentAuthor")}</label>
              <input id="uname" type="text" autoCapitalize="none" autoCorrect="off" placeholder="@non" value={username} onChange={(e) => setUsername(e.target.value)}
                className="h-[50px] rounded-xl border border-border bg-surface px-3.5 text-base" />
            </>
          )}

          {liveAny && (
            <div className="flex gap-2.5 rounded-xl bg-[#FFEDD5] p-3 text-[13px] leading-normal text-[#7C2D12]">
              <span className="flex h-[22px] flex-none items-center rounded-md bg-[#DC2626] px-2 text-[11px] font-extrabold text-white">LIVE</span>
              <span>{t("liveWarn")}</span>
            </div>
          )}

          {meta.drip && (
            <div className="mt-1 flex items-center gap-2 rounded-[14px] border border-border bg-surface py-1.5 pl-3.5 pr-1.5">
              <div className="flex flex-1 flex-col gap-0.5">
                <span className="text-sm font-bold">{t("dripTitle")}</span>
                <span className="text-xs text-muted">{drip ? t("dripOn", { runs: DRIP_RUNS, minutes: DRIP_INTERVAL_MIN }) : t("dripOff")}</span>
              </div>
              <button type="button" onClick={() => setSheet("drip")} aria-label={t("dripWhat")} className="h-10 w-10 flex-none rounded-full bg-surface-2 font-extrabold text-text/80">?</button>
              <button type="button" onClick={() => setDrip((d) => !d)} aria-pressed={drip} aria-label={t("dripToggle")} className="grid h-11 w-[60px] flex-none place-items-center">
                <span className={`flex h-7 w-12 rounded-full p-[3px] ${drip ? "justify-end bg-text" : "justify-start bg-surface-2"}`}><span className="h-[22px] w-[22px] rounded-full bg-surface keep-white" /></span>
              </button>
            </div>
          )}
        </section>

        {/* Summary */}
        <section className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
          <div className="flex justify-between gap-2.5 text-sm"><span className="text-muted">{t("service")}</span><span className="text-right font-semibold">{`${platform.name} ${t(`kind_${service.kind}`)} · ${tier.name}`}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted">{t("quantity")}</span><span className="font-semibold">{hasComments ? t("commentsCount", { n: quantity }) : `${num(quantity)}${isLive ? ` · ${durLabel(dur)}` : ""}`}</span></div>
          <div className="flex justify-between text-sm"><span className="text-muted">{t("avgDelivery")}</span><span className="font-semibold">{meta.avg[locale]}</span></div>
          {discount > 0 && <div className="flex justify-between text-sm"><span className="text-muted">VIP</span><span className="font-semibold text-success">-{discount}%</span></div>}
          <div className="my-1 h-px bg-border" />
          <div className="flex items-baseline justify-between"><span className="text-[15px] font-bold">{t("total")}</span><span className="text-2xl font-extrabold">{fmt(total)}</span></div>
          {rangeError && <p className="rounded-[10px] bg-warning-soft px-3 py-2.5 text-[13px] text-warning">{rangeError}</p>}
          {short && (
            <p className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
              {t("short")} <Link href="/account/wallet" className="font-bold text-danger underline">{t("addFunds")}</Link>
            </p>
          )}
        </section>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border border-border bg-surface p-3.5 text-[13px] leading-normal">
          <input type="checkbox" checked={isPublic} onChange={() => setIsPublic((v) => !v)} className="m-0 h-[22px] w-[22px] flex-none accent-text" />
          <span>{t("publicConfirm")}</span>
        </label>

        {isHigh && (
          <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl border-2 border-[#FCA5A5] bg-[#FEF2F2] p-3.5 text-[13px] leading-normal text-[#7F1D1D]">
            <input type="checkbox" checked={accepted} onChange={() => setAccepted((a) => !a)} className="m-0 h-[22px] w-[22px] flex-none accent-[#DC2626]" />
            <span>{t.rich("riskAccept", { b: (c) => <b>{c}</b> })}</span>
          </label>
        )}

        {error && <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger">{error}</p>}
        {signedIn ? (
          <button type="button" onClick={submit} disabled={!ready || pending}
            className={`flex h-[54px] items-center justify-center rounded-[14px] text-base font-bold ${ready && !pending ? "bg-text text-surface" : "bg-surface-2 text-muted"}`}>
            {pending ? t("sending") : t("confirm", { total: fmt(total) })}
          </button>
        ) : (
          <Link href={`/auth/login?next=/order`} className="flex h-[54px] items-center justify-center rounded-[14px] bg-text text-base font-bold text-surface">{t("signInToOrder")}</Link>
        )}
        <p className="text-center text-xs leading-normal text-muted">{t("autoRefund")}</p>
      </div>

      {info && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(15,23,42,0.55)]" onClick={() => setSheet(null)}>
          <div role="dialog" aria-modal="true" aria-label={info.title} onClick={(e) => e.stopPropagation()}
            className="mx-auto flex w-full max-w-[560px] flex-col gap-3.5 rounded-t-[22px] bg-surface px-[22px] pb-[calc(30px+env(safe-area-inset-bottom,0px))] pt-3">
            <div className="h-[5px] w-10 self-center rounded-full bg-border" />
            <h2 className="text-lg font-extrabold">{info.title}</h2>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-text/80">{info.text}</p>
            {info.example && <div className="whitespace-pre-line rounded-xl bg-primary-soft px-3.5 py-3 text-sm leading-normal text-cyan">{info.example}</div>}
            <button type="button" onClick={() => setSheet(null)} className="h-[50px] rounded-[14px] bg-text text-base font-bold text-surface">{t("gotIt")}</button>
          </div>
        </div>
      )}
    </div>
  );
}

const TILE_TONE = { good: "bg-success-soft text-success", warn: "bg-warning-soft text-warning", bad: "bg-danger-soft text-danger", info: "bg-primary-soft text-cyan" } as const;
type Tone = keyof typeof TILE_TONE;

/** Details card (as on big SMM panels): tiles for the selected choice, then "read before ordering" and service news. */
function ServiceDetails({ id, tab, setTab, meta, post, live, locale, updates }: {
  id: string;
  tab: "info" | "read" | "updates";
  setTab: (t: "info" | "read" | "updates") => void;
  meta: ServiceMeta;
  post: boolean;
  live: boolean;
  locale: string;
  updates: ServiceUpdateView[];
}) {
  const t = useTranslations("orderForm");
  const info = meta.info ?? {};
  const tiles: { label: string; value: string; tone: Tone; icon: string }[] = [];
  if (info.quality) tiles.push({ label: t("tQuality"), value: t(`q_${info.quality}`), tone: info.quality === "bot" ? "bad" : info.quality === "mixed" ? "warn" : "good", icon: "M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9z" });
  if (info.speed) tiles.push({ label: t("tSpeed"), value: t("speedVal", { speed: info.speed }), tone: "info", icon: "M13 2 3 14h9l-1 8 10-12h-9z" });
  if (info.start) tiles.push({ label: t("tStart"), value: info.start === "instant" ? t("startInstant") : info.start, tone: "info", icon: "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z" });
  tiles.push({ label: t("tGuarantee"), value: meta.refillDays ? t("refillYes", { days: meta.refillDays }) : t("refillNo"), tone: meta.refillDays ? "good" : "bad", icon: "M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" });
  if (info.drop) tiles.push({ label: t("tDrop"), value: t(`drop_${info.drop}`), tone: info.drop === "none" ? "good" : info.drop === "low" ? "warn" : "bad", icon: "M3 7l6 6 4-4 8 8M21 11v6h-6" });
  tiles.push({ label: t("tLink"), value: live ? t("linkLiveShort") : post ? t("linkPostShort") : t("linkProfileShort"), tone: "info", icon: "M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" });
  if (info.cancel !== undefined) tiles.push({ label: t("tCancel"), value: info.cancel ? t("yes") : t("no"), tone: info.cancel ? "good" : "bad", icon: "M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0" });
  tiles.push({ label: t("tRefillBtn"), value: meta.refillDays ? t("yes") : t("no"), tone: meta.refillDays ? "good" : "bad", icon: "M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" });
  if (info.location) tiles.push({ label: t("tLocation"), value: info.location, tone: "info", icon: "M12 22s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z" });
  const tabs = [["info", t("tabInfo")], ["read", t("tabRead")], ["updates", t("tabUpdates")]] as const;
  const about = meta.about?.[locale];
  const when = (iso: string) => new Date(iso).toLocaleDateString(locale === "fr" ? "fr-FR" : "fr-HT", { day: "numeric", month: "short" });
  return (
    <section id={id} className="scroll-mt-20 overflow-hidden rounded-2xl border border-border bg-surface">
      <div role="tablist" aria-label={t("tabInfo")} className="flex gap-1 overflow-x-auto border-b border-border p-1.5 [scrollbar-width:none]">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-10 flex-none rounded-[10px] px-3 text-[13px] font-bold ${tab === k ? "bg-text text-surface" : "text-text/80"}`}>{label}</button>
        ))}
      </div>
      {tab === "info" && (
        <div className="flex flex-col gap-2.5 p-3">
          {about && <p className="text-sm leading-normal">{about}</p>}
          <div className="grid grid-cols-2 gap-2">
            {tiles.map((x) => (
              <div key={x.label} className="flex items-center gap-2.5 rounded-xl border border-border p-2.5">
                <span className={`grid h-9 w-9 flex-none place-items-center rounded-[10px] ${TILE_TONE[x.tone]}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={x.icon} /></svg>
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="text-[10px] font-bold uppercase tracking-[0.4px] text-muted">{x.label}</span>
                  <span className="text-[13px] font-bold leading-tight">{x.value}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">{t("detailLimits", { min: num(meta.min), max: num(meta.max) })} · {t(`risk_${meta.risk}`)}</p>
        </div>
      )}
      {tab === "read" && (
        <div className="flex flex-col gap-3 p-3.5 text-[13px] leading-normal">
          <p className="font-bold">{t("readStatusTitle")}</p>
          <ul className="flex flex-col gap-1.5">
            {([["pending", "#B45309"], ["running", "#1E40AF"], ["done", "#166534"], ["partial", "#B45309"], ["canceled", "#B91C1C"]] as const).map(([k, c]) => (
              <li key={k}><b style={{ color: c }}>{t(`readS_${k}`)}</b> {t(`readS_${k}_text`)}</li>
            ))}
          </ul>
          <p className="font-bold">{t("readRefundTitle")}</p>
          <p>{t("readRefund")}</p>
          <p className="font-bold">{t("readHowTitle")}</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {[1, 2, 3, 4].map((i) => <li key={i}>{t(`readHow${i}`)}</li>)}
          </ul>
          <p className="text-muted">{t("readTicket")}</p>
        </div>
      )}
      {tab === "updates" && (
        <ul className="flex flex-col p-3">
          {updates.map((u) => (
            <li key={u.id} className="flex items-start justify-between gap-3 border-b border-border py-2 text-[13px] last:border-0">
              <span>{u.text}</span>
              <span className="flex-none text-xs text-muted">{when(u.at)}</span>
            </li>
          ))}
          {!updates.length && <li className="py-2 text-[13px] text-muted">{t("noUpdates")}</li>}
        </ul>
      )}
    </section>
  );
}
