/**
 * First-run setup: create (or promote) the Super Admin.
 *   npm run setup:admin -- --email you@example.com --name "Your Name"
 * The password is read from the ADMIN_PASSWORD env var or prompted, never passed on the command line.
 * The admin must set up two-factor authentication at first sign-in (/admin/login).
 */
import { createInterface } from "node:readline/promises";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/db";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.toLowerCase();
  const name = arg("name") ?? "Super Admin";
  if (!email) throw new Error("Usage: npm run setup:admin -- --email you@example.com --name \"Your Name\"");

  const existing = await prisma.user.findUnique({ where: { email } });
  if (!existing) {
    let password = process.env.ADMIN_PASSWORD;
    if (!password) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      password = await rl.question("Password (min 12 characters): ");
      rl.close();
    }
    if (!password || password.length < 12) throw new Error("Use a password of at least 12 characters");
    await auth.api.signUpEmail({ body: { email, password, name } });
  }
  await prisma.user.update({ where: { email }, data: { role: "SUPER_ADMIN", status: "ACTIVE" } });
  await prisma.auditEvent.create({ data: { action: "staff.bootstrap", targetType: "User", metadata: { email } } });
  console.log(`✓ ${email} is a Super Admin. Sign in at /admin/login and set up two-factor authentication.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
