"use client";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runFirstSetup } from "@/actions/setup";
import { Logo } from "@/components/Logo";

export function SetupForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return (
    <form
      method="post"
      className="card w-full max-w-md space-y-4 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          setError("");
          const r = await runFirstSetup(fd);
          if (r.ok) router.push("/admin/login?setup=1");
          else setError(r.error);
        });
      }}
    >
      <Logo />
      <h1 className="text-xl font-bold">First-time setup</h1>
      <p className="text-sm text-muted">Create the owner (Super Admin) account. This page closes for good once it's done.</p>
      <label className="block"><span className="label">Setup code</span><input name="code" type="password" required autoComplete="off" className="input" /><span className="mt-1 block text-xs text-muted">The CRON_SECRET value you added in Vercel.</span></label>
      <label className="block"><span className="label">Your name</span><input name="name" required maxLength={80} autoComplete="name" className="input" /></label>
      <label className="block"><span className="label">Email</span><input name="email" type="email" required autoComplete="email" className="input" /></label>
      <label className="block"><span className="label">Password (12+ characters)</span><input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="input" /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="demo" defaultChecked className="mt-1" /> Load the demo catalog (9 example products with DEMO codes, for trying the store; delete or edit them before launch)</label>
      {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
      <button className="btn-primary w-full" disabled={pending || !hydrated}>{pending ? "Setting up…" : "Create admin account"}</button>
    </form>
  );
}
