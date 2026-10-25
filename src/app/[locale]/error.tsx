"use client";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { reportClientError } from "@/lib/client-report";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const tc = useTranslations("common");
  useEffect(() => reportClientError(error), [error]);
  return (
    <div className="container-page grid min-h-[50vh] place-items-center py-16 text-center">
      <div className="max-w-md space-y-4">
        <p className="text-4xl" aria-hidden>⚠️</p>
        <h1 className="text-xl font-bold">{tc("error")}</h1>
        {error.digest && <p className="font-mono text-xs text-muted">Ref: {error.digest}</p>}
        <button type="button" className="btn-primary" onClick={reset}>↻</button>
      </div>
    </div>
  );
}
