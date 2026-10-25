import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, get, put } from "@vercel/blob";
import { randomToken } from "./crypto";

/**
 * Private file storage for payment evidence.
 * - Production: a private Vercel Blob store (connecting the store to the project sets BLOB_READ_WRITE_TOKEN). Vercel's disk is not persistent.
 * - Development: local `uploads/` folder when no bucket is configured.
 */
const ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "uploads");
const ALLOWED: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

export class UploadError extends Error {}

function blobEnabled() {
  return !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.BLOB_STORE_ID;
}

/** True when uploads can be stored durably in this environment. */
export function uploadsEnabled() {
  return blobEnabled() || process.env.NODE_ENV !== "production" || !!process.env.UPLOAD_DIR;
}

export async function savePrivateImage(file: File, folder: string): Promise<string> {
  const ext = ALLOWED[file.type];
  if (!ext) throw new UploadError("type");
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError("size");
  const buf = Buffer.from(await file.arrayBuffer());
  // Check magic bytes, not just the declared type.
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isWebp = buf.subarray(8, 12).toString() === "WEBP";
  if (!isJpeg && !isPng && !isWebp) throw new UploadError("type");
  const name = `${folder}/${Date.now()}-${randomToken(12)}.${ext}`;

  if (blobEnabled()) {
    const blob = await put(name, buf, { access: "private", contentType: file.type, addRandomSuffix: false });
    return blob.pathname;
  }
  if (!uploadsEnabled()) throw new UploadError("storage");
  await mkdir(path.join(ROOT, folder), { recursive: true });
  await writeFile(path.join(ROOT, name), buf);
  return name;
}

// ───────────── Public images (products, categories, logo, hero) ─────────────

const PUBLIC_ROOT = path.join(ROOT, "public");
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Store a public image and return its URL, always /media/<folder>/<file> (served by app/media/[...path]).
 * Production: kept in the same private Blob store as payment screenshots (one store, set to Private), under public/.
 * Development: `uploads/public`.
 */
export async function savePublicImage(file: File, folder: "products" | "categories" | "brand"): Promise<string> {
  const ext = ALLOWED[file.type];
  if (!ext) throw new UploadError("type");
  if (file.size > MAX_IMAGE_BYTES) throw new UploadError("size");
  const buf = Buffer.from(await file.arrayBuffer());
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const isWebp = buf.subarray(8, 12).toString() === "WEBP";
  if (!isJpeg && !isPng && !isWebp) throw new UploadError("type");
  const name = `${folder}/${Date.now()}-${randomToken(8)}.${ext}`;

  if (blobEnabled()) {
    await put(`public/${name}`, buf, { access: "private", contentType: file.type, addRandomSuffix: false });
    return `/media/${name}`;
  }
  if (!uploadsEnabled()) throw new UploadError("storage");
  await mkdir(path.join(PUBLIC_ROOT, folder), { recursive: true });
  await writeFile(path.join(PUBLIC_ROOT, name), buf);
  return `/media/${name}`;
}

/** A public image by its path after /media/ (from the Blob store in production, the local folder otherwise). */
export async function readPublicFile(relPath: string): Promise<Buffer> {
  if (!/^(products|categories|brand)\/[\w.-]+$/.test(relPath)) throw new Error("Invalid path");
  if (blobEnabled()) {
    const res = await get(`public/${relPath}`, { access: "private" });
    if (!res || res.statusCode !== 200) throw new Error("File not found");
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }
  return readLocalPublicFile(relPath);
}

export async function readLocalPublicFile(relPath: string): Promise<Buffer> {
  const full = path.resolve(PUBLIC_ROOT, relPath);
  if (!full.startsWith(path.resolve(PUBLIC_ROOT) + path.sep)) throw new Error("Invalid path");
  return readFile(full);
}

/** Remove a public image we stored (Blob URL or local /media path). Unknown URLs are ignored. */
export async function deletePublicImage(url: string): Promise<void> {
  if (!isOwnImageUrl(url)) return;
  if (url.startsWith("/media/") && blobEnabled()) {
    await del(`public/${url.slice("/media/".length)}`).catch(() => {});
    return;
  }
  if (url.startsWith("/media/")) {
    const full = path.resolve(PUBLIC_ROOT, url.slice("/media/".length));
    if (!full.startsWith(path.resolve(PUBLIC_ROOT) + path.sep)) return;
    await unlink(full).catch(() => {});
    return;
  }
  if (blobEnabled()) await del(url);
}

/** Only accept image URLs we produced: /media paths (and Blob public URLs from older uploads). */
export function isOwnImageUrl(url: string): boolean {
  if (/^\/media\/(products|categories|brand)\/[\w.-]+$/.test(url)) return true;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.endsWith(".public.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

export async function readPrivateFile(relPath: string): Promise<Buffer> {
  if (blobEnabled()) {
    const res = await get(relPath, { access: "private", useCache: false });
    if (!res || res.statusCode !== 200) throw new Error("File not found");
    return Buffer.from(await new Response(res.stream).arrayBuffer());
  }
  const full = path.resolve(ROOT, relPath);
  if (!full.startsWith(path.resolve(ROOT) + path.sep)) throw new Error("Invalid path");
  return readFile(full);
}
