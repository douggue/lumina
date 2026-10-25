"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertStaff } from "@/lib/session";
import { audit } from "@/lib/audit";
import { getSettings, setSetting, fullTheme, type ThemeConfig } from "@/lib/settings";
import { normalizeHomepage, type HomepageConfig } from "@/lib/homepage";
import { isOwnImageUrl } from "@/lib/storage";
import { contrastRatio } from "@/lib/color";

type R = { ok: true; message?: string } | { ok: false; error: string };
const fail = (e: unknown): R => ({ ok: false, error: e instanceof Error ? e.message : "Unexpected error" });
const LOCALES = ["ht", "fr"] as const;
const localized = (form: FormData, prefix: string, max = 300) =>
  Object.fromEntries(LOCALES.map((l) => [l, String(form.get(`${prefix}_${l}`) ?? "").trim().slice(0, max)]));

// ───────────── Homepage ─────────────

export async function saveHomepage(config: HomepageConfig, publish: boolean): Promise<R> {
  try {
    const staff = await assertStaff("content.manage");
    const clean = normalizeHomepage(config);
    for (const k of ["eyebrow", "title", "subtitle"] as const) {
      clean.hero[k] = Object.fromEntries(LOCALES.map((l) => [l, String(config.hero?.[k]?.[l] ?? "").trim().slice(0, k === "subtitle" ? 300 : 120)]));
    }
    await setSetting("homepageDraft", clean);
    if (publish) {
      const s = await getSettings();
      const history = [{ at: new Date().toISOString(), by: staff.name, config: s.homepage ?? null }, ...(s.homepageHistory ?? [])].slice(0, 10);
      await setSetting("homepage", clean);
      await setSetting("homepageHistory", history);
      revalidatePath("/", "layout");
    }
    await audit(staff.id, publish ? "homepage.publish" : "homepage.draft", "SiteSetting", "homepage");
    return { ok: true, message: publish ? "Published" : "Draft saved" };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreHomepage(index: number): Promise<R> {
  try {
    const staff = await assertStaff("content.manage");
    const s = await getSettings();
    const entry = s.homepageHistory?.[index];
    if (!entry) return { ok: false, error: "Version not found" };
    await setSetting("homepageDraft", normalizeHomepage(entry.config));
    await audit(staff.id, "homepage.restore_to_draft", "SiteSetting", "homepage", { from: entry.at });
    return { ok: true, message: "Loaded into the draft. Review it, then publish." };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── News ─────────────

export async function saveNews(form: FormData): Promise<R & { id?: string }> {
  try {
    const staff = await assertStaff("content.manage");
    const id = String(form.get("id") ?? "") || null;
    const slug = String(form.get("slug") ?? "").trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return { ok: false, error: "Slug must be lowercase letters, numbers and dashes" };
    const title = localized(form, "title", 160);
    if (!title.ht && !title.fr) return { ok: false, error: "Title in Kreyòl or French is required" };
    const image = String(form.get("image") ?? "").trim();
    if (image && !isOwnImageUrl(image)) return { ok: false, error: "Invalid image" };
    const isPublished = form.get("isPublished") === "on";
    const dateRaw = String(form.get("publishedAt") ?? "");
    const publishedAt = dateRaw ? new Date(dateRaw) : isPublished ? new Date() : null;
    if (publishedAt && Number.isNaN(publishedAt.getTime())) return { ok: false, error: "Invalid publish date" };
    const data = { slug, title, excerpt: localized(form, "excerpt", 300), body: localized(form, "body", 20_000), image: image || null, isPublished, publishedAt };
    const a = id ? await prisma.newsArticle.update({ where: { id }, data }) : await prisma.newsArticle.create({ data });
    await audit(staff.id, id ? "news.update" : "news.create", "NewsArticle", a.id, { slug, isPublished });
    revalidatePath("/", "layout");
    return { ok: true, id: a.id, message: "Saved" };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "That slug is already used" };
    return fail(e);
  }
}

export async function deleteNews(id: string): Promise<R> {
  try {
    const staff = await assertStaff("content.manage");
    await prisma.newsArticle.delete({ where: { id } });
    await audit(staff.id, "news.delete", "NewsArticle", id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── SEO ─────────────

const pathRe = /^\/[a-z0-9\-/_.]*$/i;

export async function saveRedirect(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("seo.manage");
    let from = String(form.get("from") ?? "").trim().replace(/\/+$/, "") || "/";
    from = from.replace(/^\/(ht|fr|en|es)(?=\/|$)/, "") || "/";
    const to = String(form.get("to") ?? "").trim();
    if (!pathRe.test(from) || from === "/") return { ok: false, error: "From must be a path like /old-page" };
    if (!pathRe.test(to) && !/^https:\/\//.test(to)) return { ok: false, error: "To must be a path like /store or an https:// address" };
    if (to === from) return { ok: false, error: "A redirect can't point to itself" };
    await prisma.redirectRule.upsert({ where: { from }, create: { from, to, permanent: form.get("permanent") === "on" }, update: { to, permanent: form.get("permanent") === "on" } });
    await audit(staff.id, "seo.redirect.save", "RedirectRule", from, { to });
    revalidatePath("/admin/seo");
    return { ok: true, message: "Redirect saved" };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteRedirect(id: string): Promise<R> {
  try {
    const staff = await assertStaff("seo.manage");
    await prisma.redirectRule.delete({ where: { id } });
    await audit(staff.id, "seo.redirect.delete", "RedirectRule", id);
    revalidatePath("/admin/seo");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function savePageSeo(form: FormData): Promise<R> {
  try {
    const staff = await assertStaff("seo.manage");
    const path = String(form.get("path"));
    const title = localized(form, "title", 70);
    const description = localized(form, "description", 170);
    await prisma.pageSeo.upsert({ where: { path }, create: { path, title, description }, update: { title, description } });
    await audit(staff.id, "seo.page.save", "PageSeo", path);
    revalidatePath("/", "layout");
    return { ok: true, message: "Saved" };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Translations ─────────────

export async function saveTranslation(locale: string, key: string, value: string): Promise<R> {
  try {
    const staff = await assertStaff("content.manage");
    if (!(LOCALES as readonly string[]).includes(locale)) return { ok: false, error: "Unknown language" };
    if (!/^[a-zA-Z0-9_.]+$/.test(key)) return { ok: false, error: "Invalid key" };
    const v = value.trim().slice(0, 2000);
    if (v) await prisma.translationOverride.upsert({ where: { locale_key: { locale, key } }, create: { locale, key, value: v }, update: { value: v } });
    else await prisma.translationOverride.deleteMany({ where: { locale, key } });
    await audit(staff.id, v ? "translation.save" : "translation.reset", "TranslationOverride", `${locale}:${key}`);
    revalidateTag("translations");
    revalidatePath("/", "layout");
    return { ok: true, message: v ? "Saved" : "Reset to default" };
  } catch (e) {
    return fail(e);
  }
}

// ───────────── Theme ─────────────

const hex = /^#[0-9a-fA-F]{6}$/;

export async function saveTheme(input: ThemeConfig): Promise<R> {
  try {
    const staff = await assertStaff("content.manage");
    const theme = fullTheme(input);
    for (const k of ["primary", "primaryDark", "navy", "midnight", "lightBg"] as const) if (!hex.test(theme[k])) return { ok: false, error: `${k} must be a #RRGGBB color` };
    // Text must stay readable everywhere (WCAG AA).
    if (contrastRatio(theme.primary, "#FFFFFF") < 4.5) return { ok: false, error: "Main color is too light for white button text (needs 4.5:1 contrast). Pick a darker color." };
    if (contrastRatio(theme.primaryDark, theme.midnight) < 3) return { ok: false, error: "Dark-mode accent is too dark to see on the dark background. Pick a lighter color." };
    if (contrastRatio(theme.navy, "#FFFFFF") < 7) return { ok: false, error: "Dark cards must stay dark enough for white text (7:1)." };
    if (contrastRatio(theme.lightBg, "#0B1426") < 10) return { ok: false, error: "Light background is too dark for dark text. Pick a lighter color." };
    const marquee: Record<string, string> = {};
    for (const l of ["ht", "fr"]) marquee[l] = String(theme.marquee[l] ?? "").replace(/[<>]/g, "").slice(0, 300);
    const clean: ThemeConfig = {
      primary: theme.primary.toUpperCase(),
      primaryDark: theme.primaryDark.toUpperCase(),
      navy: theme.navy.toUpperCase(),
      midnight: theme.midnight.toUpperCase(),
      lightBg: theme.lightBg.toUpperCase(),
      radius: Math.max(0, Math.min(28, Math.round(Number(theme.radius) || 0))),
      animations: !!theme.animations,
      defaultMode: theme.defaultMode === "light" ? "light" : "dark",
      motion: (["calm", "lively", "neon"] as const).includes(theme.motion) ? theme.motion : "lively",
      glow: Math.max(0, Math.min(100, Math.round(Number(theme.glow) || 0))),
      displayFont: theme.displayFont === "plain" ? "plain" : "bold",
      heroGrid: !!theme.heroGrid,
      marquee,
    };
    const s = await getSettings();
    const history = [{ at: new Date().toISOString(), by: staff.name, theme: fullTheme(s.theme) }, ...(s.themeHistory ?? [])].slice(0, 10);
    await setSetting("theme", clean);
    await setSetting("themeHistory", history);
    await audit(staff.id, "theme.save", "SiteSetting", "theme", clean);
    revalidatePath("/", "layout");
    return { ok: true, message: "Theme published" };
  } catch (e) {
    return fail(e);
  }
}
