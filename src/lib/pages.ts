import { z } from "zod";

const L = z.record(z.string().max(5000));

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: L }),
  z.object({ type: z.literal("text"), body: L }),
  z.object({ type: z.literal("image"), url: z.string().max(500), caption: L.default({}) }),
  z.object({ type: z.literal("button"), label: L, href: z.string().max(300) }),
  z.object({ type: z.literal("faq"), items: z.array(z.object({ q: L, a: L })).max(30) }),
  z.object({ type: z.literal("products"), category: z.string().max(80) }),
]);
export const blocksSchema = z.array(blockSchema).max(40);
export type PageBlock = z.infer<typeof blockSchema>;

export const BLOCK_LABELS: Record<PageBlock["type"], string> = {
  heading: "Heading",
  text: "Text",
  image: "Image",
  button: "Button",
  faq: "Questions & answers",
  products: "Products from a category",
};

export function safeHref(href: string) {
  return href.startsWith("/") || href.startsWith("https://") ? href : "/";
}
