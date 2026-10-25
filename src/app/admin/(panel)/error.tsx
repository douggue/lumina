"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/client-report";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error), [error]);
  return (
    <div className="card mx-auto max-w-lg space-y-3 p-6 text-center">
      <h1 className="text-lg font-bold">This page hit an error</h1>
      <p className="text-sm text-muted">Nothing was changed. Try again; if it keeps happening, send the reference below to your developer.</p>
      {error.digest && <p className="font-mono text-xs">Ref: {error.digest}</p>}
      <button type="button" className="btn-primary" onClick={reset}>Try again</button>
    </div>
  );
}
