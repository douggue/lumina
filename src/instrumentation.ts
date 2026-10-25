import type { Instrumentation } from "next";

export async function register() {}

/** Server errors (pages, server actions, API routes) go to Sentry when SENTRY_DSN is set. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (!process.env.SENTRY_DSN || process.env.NEXT_RUNTIME === "edge") return;
  const { reportError } = await import("./lib/monitor");
  await reportError(error, {
    source: "server",
    path: request.path,
    method: request.method,
    digest: (error as { digest?: string }).digest,
    extra: { routePath: context.routePath, routeType: context.routeType },
  });
};
