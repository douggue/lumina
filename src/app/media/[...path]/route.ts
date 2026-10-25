import { NextResponse } from "next/server";
import { readPublicFile } from "@/lib/storage";

/** Serves uploaded public images (products, categories, logo): from the private Blob store in production, the local folder in development. Cached for a year: every upload gets a new file name. */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  try {
    const buf = await readPublicFile(path.join("/"));
    const ext = path.at(-1)?.split(".").pop();
    const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
