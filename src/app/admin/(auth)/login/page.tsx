import { AdminLoginForm } from "./form";

export const metadata = { title: "Staff sign in" };

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const { setup } = await searchParams;
  return (
    <div className="grid min-h-dvh place-items-center gap-3 bg-midnight p-4">
      <div className="w-full max-w-md space-y-3">
        {setup && <p className="rounded-xl bg-success-soft px-4 py-3 text-sm text-success" role="status">Admin account created. Sign in now; you'll set up two-factor authentication with an authenticator app (Google Authenticator, Authy…).</p>}
        <AdminLoginForm />
      </div>
    </div>
  );
}
