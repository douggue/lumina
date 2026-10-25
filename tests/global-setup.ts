import { execSync } from "node:child_process";

/**
 * Integration tests run against a separate, disposable database (TEST_DATABASE_URL).
 * Migrations are applied non-destructively; every test creates its own users, so no reset is needed.
 */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Set TEST_DATABASE_URL to a disposable database");
  if (url === process.env.DATABASE_URL_MAIN) throw new Error("TEST_DATABASE_URL must not be the main database");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url } });
}
