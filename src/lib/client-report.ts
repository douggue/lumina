/** Send a browser error to /api/client-error (ignored by the server unless monitoring is on). */
export function reportClientError(error: Error & { digest?: string }) {
  try {
    const body = JSON.stringify({ message: error.message, stack: error.stack, digest: error.digest, path: location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    else fetch("/api/client-error", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
  } catch {
    // never throw from the error reporter
  }
}
