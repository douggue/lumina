"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/client-report";

/** Last-resort error page (the layout itself failed). Plain HTML, works without styles. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportClientError(error), [error]);
  return (
    <html lang="ht">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#050b18", color: "#f5f7fc", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center", padding: 16 }}>
        <div>
          <h1 style={{ fontSize: 20 }}>Gen yon pwoblèm. · Une erreur est survenue. · Something went wrong.</h1>
          {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12, opacity: 0.7 }}>Ref: {error.digest}</p>}
          <button type="button" onClick={reset} style={{ marginTop: 16, padding: "12px 20px", borderRadius: 10, border: 0, background: "#1467f5", color: "#fff", fontWeight: 700 }}>↻</button>
        </div>
      </body>
    </html>
  );
}
