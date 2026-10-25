import { afterEach, describe, expect, it, vi } from "vitest";
import { parseStatement } from "@/lib/reconcile";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";
import { monitoringEnabled, reportError } from "@/lib/monitor";

describe("statement parser", () => {
  it("reads comma CSV with US amounts", () => {
    const r = parseStatement("Date,Reference,Amount\n2026-10-01,nc 123,\"1,250.00\"\n2026-10-01,NC124,500");
    expect(r.rows).toEqual([
      { reference: "NC123", amount: 125000, date: "2026-10-01" },
      { reference: "NC124", amount: 50000, date: "2026-10-01" },
    ]);
  });
  it("reads semicolon CSV with French headers and amounts", () => {
    const r = parseStatement("Date;Transaction;Montant\n01/10/2026;AB-9;1 250,50 HTG");
    expect(r.rows).toEqual([{ reference: "AB-9", amount: 125050, date: "01/10/2026" }]);
  });
  it("explains missing columns and skips bad rows", () => {
    expect(parseStatement("foo,bar\n1,2").error).toMatch(/reference and amount/);
    expect(parseStatement("ref,amount\nX,0\n,10\nY,abc").rows).toEqual([]);
  });
});

describe("switched-off services", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("Turnstile passes everything until both keys are set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect(turnstileEnabled()).toBe(false);
    expect(await verifyTurnstile(undefined)).toBe(true);
  });

  it("Turnstile rejects a missing token once on", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "x");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "y");
    expect(await verifyTurnstile("")).toBe(false);
  });

  it("Sentry sends a scrubbed envelope only with a DSN", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("SENTRY_DSN", "");
    await reportError(new Error("x"), { source: "server" });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.stubEnv("SENTRY_DSN", "https://abc123@o1.ingest.sentry.io/42");
    expect(monitoringEnabled()).toBe(true);
    await reportError(new Error("failed for jean@example.com token=secret1"), { source: "server", path: "/ht/auth/reset?token=abc" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://o1.ingest.sentry.io/api/42/envelope/");
    expect(init.body).not.toContain("jean@example.com");
    expect(init.body).not.toContain("secret1");
    expect(init.body).not.toContain("token=abc");
    vi.unstubAllGlobals();
  });
});
