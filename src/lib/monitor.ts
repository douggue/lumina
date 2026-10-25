/**
 * Minimal Sentry reporter without the SDK (keeps the bundle small for slow mobile connections).
 * Off until SENTRY_DSN is set. Sends one "event" envelope per error to Sentry's ingest API.
 */
type Dsn = { url: string; key: string };

function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\//, "");
    if (!u.username || !project) return null;
    return { url: `${u.protocol}//${u.host}/api/${project}/envelope/`, key: u.username };
  } catch {
    return null;
  }
}

export function monitoringEnabled() {
  return !!parseDsn(process.env.SENTRY_DSN);
}

// Never send secrets or personal data: strip query strings and anything that looks like a token or email.
function scrub(s: string) {
  return s.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").replace(/(token|secret|password|code)=[^&\s]+/gi, "$1=[redacted]");
}

export async function reportError(
  error: unknown,
  context: { path?: string; method?: string; source: "server" | "client"; digest?: string; extra?: Record<string, string> },
) {
  const dsn = parseDsn(process.env.SENTRY_DSN);
  if (!dsn) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    tags: { source: context.source, ...(context.digest ? { digest: context.digest } : {}) },
    transaction: context.path ? scrub(context.path.split("?")[0]) : undefined,
    request: context.path ? { url: scrub(context.path.split("?")[0]), method: context.method } : undefined,
    extra: context.extra,
    exception: {
      values: [{ type: err.name, value: scrub(err.message).slice(0, 1000), stacktrace: err.stack ? { frames: stackFrames(err.stack) } : undefined }],
    },
  };
  const envelope = `${JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() })}\n${JSON.stringify({ type: "event" })}\n${JSON.stringify(event)}`;
  try {
    await fetch(dsn.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=haitiviral/1.0` },
      body: envelope,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // monitoring must never break the request
  }
}

function stackFrames(stack: string) {
  return stack
    .split("\n")
    .slice(1, 30)
    .map((line) => {
      const m = /at (?:(.+?) )?\(?(.+?):(\d+):(\d+)\)?$/.exec(line.trim());
      return m ? { function: m[1] ?? "?", filename: m[2], lineno: Number(m[3]), colno: Number(m[4]) } : { function: line.trim() };
    })
    .reverse();
}
