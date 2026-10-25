"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Logo } from "@/components/Logo";

export function AdminLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<"password" | "totp">("password");
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  async function onPassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const res = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
    setBusy(false);
    if (res.error) {
      const code = (res.error as { code?: string }).code;
      return setError(res.error.status === 429 ? "Too many attempts. Wait a minute." : code === "ACCOUNT_BLOCKED" ? "This account is suspended." : "Invalid email or password.");
    }
    if ((res.data as { twoFactorRedirect?: boolean })?.twoFactorRedirect) return setStep("totp");
    router.push("/admin");
    router.refresh();
  }

  async function onTotp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const res = useBackup ? await authClient.twoFactor.verifyBackupCode({ code }) : await authClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (res.error) return setError("Invalid code.");
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="card w-full max-w-sm p-6 sm:p-8">
      <Logo />
      <h1 className="mt-6 text-xl font-bold">Staff sign in</h1>
      {step === "password" ? (
        <form method="post" onSubmit={onPassword} className="mt-4 space-y-4">
          <div><label className="label" htmlFor="email">Email</label><input id="email" name="email" type="email" required autoComplete="username" className="input" /></div>
          <div><label className="label" htmlFor="password">Password</label><input id="password" name="password" type="password" required autoComplete="current-password" className="input" /></div>
          {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={busy || !hydrated}>{busy ? "Signing in…" : "Continue"}</button>
        </form>
      ) : (
        <form method="post" onSubmit={onTotp} className="mt-4 space-y-4">
          <p className="text-sm text-muted">{useBackup ? "Enter one of your backup codes. Each code works once." : "Enter the 6-digit code from your authenticator app."}</p>
          {useBackup ? (
            <input key="backup" name="code" autoComplete="off" required autoFocus className="input text-center font-mono text-lg" aria-label="Backup code" />
          ) : (
            <input key="totp" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus className="input text-center text-2xl tracking-[0.4em]" aria-label="Authenticator code" />
          )}
          {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>Verify</button>
          <button type="button" className="w-full text-center text-sm text-primary" onClick={() => { setUseBackup(!useBackup); setError(""); }}>
            {useBackup ? "Use authenticator app instead" : "Lost your phone? Use a backup code"}
          </button>
        </form>
      )}
    </div>
  );
}
