"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { authClient } from "@/lib/auth-client";

export function Setup2fa({ email }: { email: string }) {
  const router = useRouter();
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [backup, setBackup] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await authClient.twoFactor.enable({ password: String(new FormData(e.currentTarget).get("password")), method: "totp" });
    setBusy(false);
    if (res.error || !res.data || res.data.method !== "totp") return setError("Password is incorrect.");
    const uri = res.data.totpURI;
    setSecret(new URL(uri).searchParams.get("secret") ?? "");
    setBackup(res.data.backupCodes);
    setQr(await QRCode.toDataURL(uri, { margin: 1, width: 220 }));
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await authClient.twoFactor.verifyTotp({ code: String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "") });
    setBusy(false);
    if (res.error) return setError("Invalid code. Check your phone's time and try again.");
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="card w-full max-w-md space-y-4 p-6 sm:p-8">
      <h1 className="text-xl font-bold">Two-factor authentication is required</h1>
      <p className="text-sm text-muted">All staff accounts ({email}) must use an authenticator app (Google Authenticator, Authy, 1Password…).</p>
      {!qr ? (
        <form method="post" onSubmit={start} className="space-y-4">
          <div><label className="label" htmlFor="password">Confirm your password</label><input id="password" name="password" type="password" required className="input" /></div>
          {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>Continue</button>
        </form>
      ) : (
        <form method="post" onSubmit={verify} className="space-y-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for your authenticator app" width={220} height={220} className="mx-auto rounded-lg bg-white p-2" />
          <p className="break-all text-center font-mono text-xs text-muted">{secret}</p>
          <details className="rounded-xl bg-surface-2 p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Backup codes (save them now)</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">{backup.map((c) => <li key={c}>{c}</li>)}</ul>
          </details>
          <div><label className="label" htmlFor="code">6-digit code</label><input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required className="input text-center text-2xl tracking-[0.4em]" /></div>
          {error && <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>Activate</button>
        </form>
      )}
    </div>
  );
}
