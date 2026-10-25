import "server-only";

export type NetworkSignal = "ok" | "vpn" | "proxy" | "datacenter" | "unknown";

export type VpnCheckResult = {
  signal: NetworkSignal;
  /** True when we should hard-block trials (VPN / proxy / datacenter). Shared mobile ≠ block. */
  block: boolean;
  raw?: string;
};

/**
 * Pluggable IP reputation for free-trial anti-cheat.
 * Set PROXYCHECK_API_KEY (proxycheck.io) or VPNAPI_KEY (vpnapi.io). When unset → signal unknown, never block.
 */
export function vpnCheckEnabled() {
  return !!(process.env.PROXYCHECK_API_KEY || process.env.VPNAPI_KEY);
}

export async function checkIpNetwork(ip: string | null | undefined): Promise<VpnCheckResult> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return { signal: "unknown", block: false };
  if (process.env.PROXYCHECK_API_KEY) return proxycheck(ip);
  if (process.env.VPNAPI_KEY) return vpnapi(ip);
  return { signal: "unknown", block: false };
}

async function proxycheck(ip: string): Promise<VpnCheckResult> {
  try {
    const key = process.env.PROXYCHECK_API_KEY!;
    const res = await fetch(`https://proxycheck.io/v2/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}&vpn=1&asn=1&risk=1`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const data = (await res.json()) as Record<string, unknown>;
    const row = (data[ip] ?? {}) as Record<string, unknown>;
    const proxy = String(row.proxy ?? "no").toLowerCase() === "yes";
    const type = String(row.type ?? "").toLowerCase();
    if (type.includes("vpn") || (proxy && type.includes("vpn"))) return { signal: "vpn", block: true, raw: type };
    if (type.includes("datacenter") || type.includes("hosting") || type.includes("server")) return { signal: "datacenter", block: true, raw: type };
    if (proxy || type.includes("proxy")) return { signal: "proxy", block: true, raw: type };
    return { signal: "ok", block: false, raw: type || "ok" };
  } catch (e) {
    console.error("proxycheck failed", e);
    return { signal: "unknown", block: false };
  }
}

async function vpnapi(ip: string): Promise<VpnCheckResult> {
  try {
    const key = process.env.VPNAPI_KEY!;
    const res = await fetch(`https://vpnapi.io/api/${encodeURIComponent(ip)}?key=${encodeURIComponent(key)}`, {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    const data = (await res.json()) as { security?: { vpn?: boolean; proxy?: boolean; tor?: boolean; relay?: boolean } };
    const s = data.security ?? {};
    if (s.vpn || s.tor || s.relay) return { signal: "vpn", block: true };
    if (s.proxy) return { signal: "proxy", block: true };
    return { signal: "ok", block: false };
  } catch (e) {
    console.error("vpnapi failed", e);
    return { signal: "unknown", block: false };
  }
}
