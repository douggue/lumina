import Link from "next/link";
import { setupOpen } from "@/actions/setup";
import { SetupForm } from "./form";

export const metadata = { title: "First-time setup" };
export const dynamic = "force-dynamic";

/** Names of required settings that are missing or malformed (names only, never values). */
function configProblems(): string[] {
  const out: string[] = [];
  if (!process.env.BETTER_AUTH_SECRET || process.env.BETTER_AUTH_SECRET.length < 16) out.push("BETTER_AUTH_SECRET");
  if (Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64").length !== 32) out.push("ENCRYPTION_KEY");
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16) out.push("CRON_SECRET");
  return out;
}

export default async function Setup() {
  const open = await setupOpen();
  const problems = configProblems();
  if (problems.length) {
    return (
      <div className="grid min-h-dvh place-items-center bg-midnight p-4">
        <div className="card w-full max-w-md space-y-3 p-6">
          <h1 className="text-xl font-bold">Almost there: settings missing</h1>
          <p className="text-sm text-muted">Add these in Vercel → Settings → Environment Variables (tick Production), then Deployments → ⋯ → Redeploy:</p>
          <ul className="list-disc space-y-1 pl-5 font-mono text-sm">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className="text-xs text-muted">ENCRYPTION_KEY must be the 44-character output of <span className="font-mono">openssl rand -base64 32</span>.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="grid min-h-dvh place-items-center bg-midnight p-4">
      {open ? (
        <SetupForm />
      ) : (
        <div className="card w-full max-w-md space-y-3 p-6 text-center">
          <h1 className="text-xl font-bold">Setup is done</h1>
          <p className="text-sm text-muted">An admin account already exists. Add more staff from Admin → Staff.</p>
          <Link href="/admin/login" className="btn-primary">Staff sign in</Link>
        </div>
      )}
    </div>
  );
}
