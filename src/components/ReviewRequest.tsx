"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { submitReview } from "@/actions/reviews";
import { CITIES } from "@/lib/cities";

/** "How was it?" — shown on a delivered order until the customer answers. */
export function ReviewRequest({ orderId, city }: { orderId: string; city: string }) {
  const t = useTranslations("trust");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  if (done) {
    return (
      <section className="card animate-rise p-5 text-center">
        <p className="text-2xl" aria-hidden>🙏</p>
        <p className="mt-1 font-bold">{t("thanks")}</p>
        <p className="text-sm text-muted">{t("thanksBody")}</p>
      </section>
    );
  }
  return (
    <form
      className="card space-y-4 border-primary/40 p-5"
      action={(fd) =>
        start(async () => {
          fd.set("rating", String(rating));
          const r = await submitReview(orderId, fd);
          if (r.ok) setDone(true);
          else setError(t("ratingMissing"));
        })
      }
    >
      <div>
        <h2 className="text-lg font-bold">{t("askTitle")}</h2>
        <p className="text-sm text-muted">{t("askBody")}</p>
      </div>
      <div className="flex gap-1" role="radiogroup" aria-label={t("stars")} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={t("starsN", { n })}
            onClick={() => { setRating(n); setError(""); }}
            onMouseEnter={() => setHover(n)}
            className={`grid h-11 w-11 place-items-center rounded-xl text-3xl transition-transform active:scale-90 ${(hover || rating) >= n ? "text-[#ffc53d]" : "text-border"}`}
          >
            ★
          </button>
        ))}
      </div>
      <label className="block">
        <span className="label">{t("comment")}</span>
        <textarea name="quote" maxLength={400} rows={3} placeholder={t("commentPlaceholder")} className="input min-h-24 py-3" />
      </label>
      <label className="block">
        <span className="label">{t("yourCity")}</span>
        <select name="city" defaultValue={city} className="input">
          <option value="">{t("cityNone")}</option>
          {CITIES.map((c) => <option key={c.name} value={c.name}>{c.flag} {c.name}</option>)}
        </select>
      </label>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <button className="btn-primary min-h-12 w-full" disabled={pending || !rating}>{t("send")}</button>
      <p className="text-xs text-muted">{t("privacyNote")}</p>
    </form>
  );
}
