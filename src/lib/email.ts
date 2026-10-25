import { prisma } from "./db";

/**
 * Transactional email through Resend (https://resend.com), sent with fetch so no SDK is needed.
 * Turns on only when RESEND_API_KEY and EMAIL_FROM are set. Until a domain is verified in Resend,
 * leave them empty: password resets then go through WhatsApp support + an admin-generated link.
 */
/** Values pasted on a phone often carry spaces, line breaks or quotes: clean them before use. */
function envClean(v: string | undefined) {
  return (v ?? "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim().replace(/^["']|["']$/g, "").trim();
}
export const resendKey = () => envClean(process.env.RESEND_API_KEY);
export const emailFrom = () => envClean(process.env.EMAIL_FROM);

export function emailEnabled(): boolean {
  return !!resendKey() && !!emailFrom();
}

/** Turn Resend's answer into a sentence the owner can act on (shown in Admin → Email). */
export function explainResendError(status: number, body: string): string {
  const b = body.toLowerCase();
  if (b.includes("api key is invalid") || status === 401) return "The API key is wrong or was deleted. Create a new key in Resend (API Keys), copy it with the copy button, and replace RESEND_API_KEY in Vercel. Then redeploy.";
  if (b.includes("restricted")) return "This key can only send. That is fine for email, so this is not the problem.";
  if (b.includes("only send testing emails to your own email")) return "Your domain is not verified yet: Resend only lets you send to your own Resend account email. Verify your domain in Resend → Domains and use an address on it in EMAIL_FROM.";
  if (b.includes("domain is not verified") || b.includes("not verified")) return "The domain in EMAIL_FROM is not verified in Resend. Finish the DNS records in Resend → Domains, or change EMAIL_FROM to an address on your verified domain.";
  if (b.includes("invalid `from`") || b.includes("from") && status === 422) return "EMAIL_FROM is not in the right format. Use: HaitiViral <noreply@yourdomain.com>";
  if (status === 429) return "Too many emails at once (Resend limit). Wait a minute and try again.";
  return `Resend refused the message (HTTP ${status}).`;
}

async function log(to: string, subject: string, status: "sent" | "failed" | "skipped", error?: string) {
  try {
    await prisma.emailLog.create({ data: { to, subject: subject.slice(0, 200), status, error: error?.slice(0, 500) } });
  } catch (e) {
    console.error("email log failed", e);
  }
}

/** Every attempt is written to EmailLog (Admin → Email), including messages skipped while email is off. */
export async function sendEmail(msg: { to: string; subject: string; html: string; text: string }): Promise<boolean> {
  return (await sendEmailResult(msg)).ok;
}

/** Same as sendEmail, plus a plain-language reason when it fails (used by the admin test button). */
export async function sendEmailResult(msg: { to: string; subject: string; html: string; text: string }): Promise<{ ok: boolean; error?: string }> {
  if (!emailEnabled()) {
    await log(msg.to, msg.subject, "skipped", "RESEND_API_KEY / EMAIL_FROM not set");
    return { ok: false, error: "Email is off: RESEND_API_KEY / EMAIL_FROM not set" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: emailFrom(), to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Resend error", res.status, body);
      const reason = explainResendError(res.status, body);
      await log(msg.to, msg.subject, "failed", `${reason} — HTTP ${res.status} ${body}`);
      return { ok: false, error: reason };
    }
    await log(msg.to, msg.subject, "sent");
    return { ok: true };
  } catch (e) {
    console.error("Resend request failed", e);
    await log(msg.to, msg.subject, "failed", e instanceof Error ? e.message : "request failed");
    return { ok: false, error: "Could not reach Resend. Try again in a minute." };
  }
}

type L = "ht" | "fr";
const lang = (l?: string | null): L => (l === "fr" ? l : "ht");

const COPY = {
  reset: {
    ht: { subject: "Chanje modpas HaitiViral ou", body: "Nou resevwa yon demann pou chanje modpas ou. Klike sou bouton an pou chwazi yon nouvo modpas. Lyen an bon pou 1 èdtan.", cta: "Chanje modpas mwen", ignore: "Si se pa ou ki te mande sa, ou pa bezwen fè anyen." },
    fr: { subject: "Réinitialisez votre mot de passe HaitiViral", body: "Nous avons reçu une demande de réinitialisation de votre mot de passe. Cliquez sur le bouton pour en choisir un nouveau. Le lien est valable 1 heure.", cta: "Réinitialiser mon mot de passe", ignore: "Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail." },
  },
  verify: {
    ht: { subject: "Konfime imèl ou pou HaitiViral", body: "Klike sou bouton an pou konfime adrès imèl ou.", cta: "Konfime imèl mwen", ignore: "Si ou pa t kreye kont sa a, ou pa bezwen fè anyen." },
    fr: { subject: "Confirmez votre e-mail HaitiViral", body: "Cliquez sur le bouton pour confirmer votre adresse e-mail.", cta: "Confirmer mon e-mail", ignore: "Si vous n'avez pas créé ce compte, ignorez cet e-mail." },
  },
} as const;

export function emailLayout(name: string, body: string, cta: string, url: string, ignore: string) {
  const safeName = name.replace(/[<>&"]/g, "");
  const html = `<!doctype html><html><body style="margin:0;background:#F5F7FC;font-family:Arial,sans-serif;color:#0b1426">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
<table width="100%" style="max-width:480px;background:#fff;border-radius:16px;padding:28px" cellpadding="0" cellspacing="0"><tr><td>
<p style="font-size:20px;font-weight:800;margin:0 0 16px">Haiti<span style="color:#D21034">Viral</span></p>
<p style="margin:0 0 8px">${safeName ? `${safeName},` : ""}</p>
<p style="margin:0 0 24px;line-height:1.5">${body}</p>
<p style="margin:0 0 24px"><a href="${url}" style="display:inline-block;background:#0F172A;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:10px">${cta}</a></p>
<p style="margin:0;font-size:13px;color:#55668a;line-height:1.5">${ignore}</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = `${safeName ? `${safeName},\n\n` : ""}${body}\n\n${cta}: ${url}\n\n${ignore}`;
  return { html, text };
}

export async function sendPasswordResetEmail(user: { email: string; name: string; locale?: string | null }, url: string) {
  const c = COPY.reset[lang(user.locale)];
  return sendEmail({ to: user.email, subject: c.subject, ...emailLayout(user.name, c.body, c.cta, url, c.ignore) });
}

export async function sendVerificationEmail(user: { email: string; name: string; locale?: string | null }, url: string) {
  const c = COPY.verify[lang(user.locale)];
  return sendEmail({ to: user.email, subject: c.subject, ...emailLayout(user.name, c.body, c.cta, url, c.ignore) });
}

/** For the admin preview screen. */
export function previewEmail(kind: "reset" | "verify", locale: string) {
  const c = COPY[kind][lang(locale)];
  return { subject: c.subject, ...emailLayout("Jean", c.body, c.cta, "https://example.com/link", c.ignore) };
}
