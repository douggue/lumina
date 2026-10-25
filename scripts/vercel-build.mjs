/**
 * Vercel build: works whatever names the database integration gave its variables.
 * - DATABASE_URL: the pooled connection the site uses.
 * - DATABASE_URL_UNPOOLED: the direct connection migrations need. If missing, it is taken from
 *   POSTGRES_URL_NON_POOLING / DIRECT_URL, or derived from a Neon pooled URL (host without "-pooler").
 * Then: prisma generate → prisma migrate deploy → next build.
 */
import { execSync } from "node:child_process";

const env = { ...process.env };
const first = (...names) => names.map((n) => env[n]).find((v) => v && v.trim());

env.DATABASE_URL = first("DATABASE_URL", "POSTGRES_PRISMA_URL", "POSTGRES_URL");
if (!env.DATABASE_URL) {
  console.error(
    "\n✖ No database connected.\n  Vercel → your project → Storage → create/connect a Neon (Postgres) database for Production and Preview, then redeploy.\n",
  );
  process.exit(1);
}

let direct = first("DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING", "DIRECT_URL", "DATABASE_URL_NON_POOLING");
if (!direct) {
  try {
    const u = new URL(env.DATABASE_URL);
    if (u.hostname.includes("-pooler.")) {
      u.hostname = u.hostname.replace("-pooler.", ".");
      u.searchParams.delete("pgbouncer");
      direct = u.toString();
      console.log("Using the direct Neon host for migrations (derived from DATABASE_URL).");
    }
  } catch {}
}
env.DATABASE_URL_UNPOOLED = direct || env.DATABASE_URL;

const missing = ["BETTER_AUTH_SECRET", "ENCRYPTION_KEY", "CRON_SECRET"].filter((n) => !env[n]);
if (missing.length) console.warn(`\n⚠ Not set yet: ${missing.join(", ")} (Settings → Environment Variables). The site needs them to work.\n`);

const run = (cmd) => execSync(cmd, { stdio: "inherit", env });
run("npx prisma generate");
run("npx prisma migrate deploy");
run("npx next build");
