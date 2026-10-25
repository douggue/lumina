/**
 * Canonical social-account key from a cleaned profile/video URL (after short-link resolve).
 * Used so free trials are one-per-account, not one-per-exact-URL.
 */

export type SocialKey = { platform: string; key: string } | null;

/** Pure: derive platform + account key from a full https URL (or @handle already expanded). */
export function socialAccountFromUrl(url: string, platformHint?: string): SocialKey {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|vm|vt)\./, "");
  const path = u.pathname.replace(/\/+$/, "") || "/";

  const tiktok = host.includes("tiktok.com");
  const ig = host.includes("instagram.com");
  const yt = host.includes("youtube.com") || host === "youtu.be";
  const fb = host.includes("facebook.com") || host.includes("fb.watch") || host === "fb.com";
  const x = host === "x.com" || host === "twitter.com";
  const tg = host === "t.me" || host.includes("telegram.");

  const platform =
    platformHint ||
    (tiktok ? "tiktok" : ig ? "instagram" : yt ? "youtube" : fb ? "facebook" : x ? "x" : tg ? "telegram" : "");

  if (!platform) return null;

  if (platform === "tiktok") {
    const m = /^\/@([^/]+)/.exec(path);
    if (m) return { platform, key: `tiktok:@${m[1].toLowerCase()}` };
    return null;
  }
  if (platform === "instagram") {
    const m = /^\/([^/]+)/.exec(path);
    if (m && !["reel", "reels", "p", "tv", "stories", "explore"].includes(m[1].toLowerCase())) {
      return { platform, key: `instagram:@${m[1].toLowerCase()}` };
    }
    // /reel/CODE or /p/CODE — account not in URL; fall back to exact path key (still better than nothing for uniqueness of that media)
    const media = /^\/(reel|reels|p|tv)\/([^/]+)/.exec(path);
    if (media) return { platform, key: `instagram:media:${media[2]}` };
    return null;
  }
  if (platform === "youtube") {
    const at = /^\/@([^/]+)/.exec(path);
    if (at) return { platform, key: `youtube:@${at[1].toLowerCase()}` };
    const ch = /^\/channel\/([^/]+)/.exec(path);
    if (ch) return { platform, key: `youtube:channel:${ch[1]}` };
    const c = /^\/c\/([^/]+)/.exec(path);
    if (c) return { platform, key: `youtube:c:${c[1].toLowerCase()}` };
    const user = /^\/user\/([^/]+)/.exec(path);
    if (user) return { platform, key: `youtube:user:${user[1].toLowerCase()}` };
    // video / shorts — no channel in URL
    const vid = u.searchParams.get("v") || (/^\/shorts\/([^/]+)/.exec(path)?.[1]) || (/^\/live\/([^/]+)/.exec(path)?.[1]);
    if (vid) return { platform, key: `youtube:video:${vid}` };
    if (host === "youtu.be") {
      const id = path.slice(1).split("/")[0];
      if (id) return { platform, key: `youtube:video:${id}` };
    }
    return null;
  }
  if (platform === "facebook") {
    const m = /^\/([^/]+)/.exec(path);
    if (m && !["watch", "reel", "share", "story.php"].includes(m[1].toLowerCase())) {
      return { platform, key: `facebook:@${m[1].toLowerCase()}` };
    }
    return { platform, key: `facebook:url:${path.toLowerCase()}` };
  }
  if (platform === "x") {
    const m = /^\/([^/]+)/.exec(path);
    if (m && !["i", "home", "explore", "search"].includes(m[1].toLowerCase())) {
      return { platform, key: `x:@${m[1].toLowerCase()}` };
    }
    return null;
  }
  if (platform === "telegram") {
    const m = /^\/([^/]+)/.exec(path);
    if (m) return { platform, key: `telegram:@${m[1].toLowerCase()}` };
  }
  return null;
}

/** Stable string stored on TrialRequest.socialAccountKey */
export function socialAccountKey(url: string, platformHint?: string): string | null {
  const s = socialAccountFromUrl(url, platformHint);
  return s?.key ?? null;
}
