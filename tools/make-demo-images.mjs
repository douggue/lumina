// Builds the pictures of the demo services (public/demo/*.png): platform colours + a service icon.
// Usage: node tools/make-demo-images.mjs
import sharp from "sharp";

const PLATFORMS = {
  tiktok: ["#111111", "#2b2b2b", "#25F4EE"],
  instagram: ["#833AB4", "#E1306C", "#FCAF45"],
  youtube: ["#B00000", "#FF2D2D", "#FFFFFF"],
  facebook: ["#0B4CC2", "#1877F2", "#FFFFFF"],
};
const ICONS = {
  followers: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M19 8v6 M22 11h-6",
  likes: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8Z",
  views: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  live: "M6 4l14 8-14 8Z",
};
const PRODUCTS = {
  "tiktok-followers": ["tiktok", "followers"], "tiktok-likes": ["tiktok", "likes"], "tiktok-views": ["tiktok", "views"],
  "instagram-followers": ["instagram", "followers"], "instagram-likes": ["instagram", "likes"], "instagram-views": ["instagram", "views"],
  "youtube-views": ["youtube", "views"], "youtube-subscribers": ["youtube", "followers"],
  "facebook-page-likes": ["facebook", "likes"], "facebook-video-views": ["facebook", "views"],
};

for (const [slug, [platform, kind]] of Object.entries(PRODUCTS)) {
  const [a, b, dot] = PLATFORMS[platform];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="800" height="800" fill="url(#g)"/>
  <circle cx="660" cy="140" r="210" fill="#ffffff" opacity="0.08"/>
  <circle cx="120" cy="700" r="160" fill="#ffffff" opacity="0.06"/>
  <g transform="translate(200 200) scale(16.67)" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[kind]}"/></g>
  <circle cx="640" cy="640" r="34" fill="${dot}"/>
</svg>`;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(`public/demo/${slug}.png`);
}
console.log("ok");
