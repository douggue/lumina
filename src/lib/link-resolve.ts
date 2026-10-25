import "server-only";

/**
 * Opens a short share link (vm.tiktok.com/…, fb.watch/…) without loading the page, following up to 4 redirects,
 * and returns where it really goes. null when it can't tell (network trouble, no redirect): the link is then kept as is.
 */
export async function resolveShortLink(url: string): Promise<string | null> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    let res: Response;
    try {
      res = await fetch(current, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(4000), headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" } });
    } catch {
      return hop ? current : null;
    }
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) return hop ? current : null;
    current = new URL(next, current).toString();
  }
  return current;
}
