# HaitiViral — Operator guide

The things to do when running the store: daily checks, backups, what to do when something breaks, and how to change keys safely.

---

## 1. Daily routine (10 minutes)

| When | Where | What |
|---|---|---|
| Morning | Admin → Dashboard | Look at the red/orange counters: payments to review, orders processing, risk flags, open tickets. |
| Morning | Admin → Reconciliation | Paste yesterday's NatCash / MonCash statement. Approve the matches; investigate "mismatched" and "missing". |
| Through the day | Admin → Payments | Approve or reject NatCash and manual transfers within 15 minutes when possible. |
| Through the day | Admin → Orders → Processing | Deliver anything that needs manual delivery (top-ups by player ID). |
| Evening | Admin → Risk queue | Clear flags: shared browsers, amount mismatches, new-account limits. |
| Weekly | Admin → Codes | Check stock for each variant; restock before it reaches zero. |
| Weekly | Admin → Security | Make sure every session belongs to someone you know; sign out the rest. |

---

## 2. Health and monitoring

- **`/api/health`**: returns `{"ok":true,"db":"up"}` (HTTP 200), or HTTP 503 when the database is down. Point a free uptime monitor at it, such as UptimeRobot or Better Stack, checking every 5 minutes, with alerts to WhatsApp, SMS or email.
- **Detailed health check**: `curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-SITE/api/health` also lists which services are configured and the queue sizes.
- **Admin → Security → Services**: the same information, on screen.
- **Errors**: create a free Sentry project (platform "Next.js"), copy its DSN into `SENTRY_DSN` in Vercel and redeploy. Server errors and errors shown to customers then appear in Sentry. Emails and tokens are removed before anything is sent.
- **Vercel → Project → Logs**: shows raw server logs for the last hours.

---

## 3. Backups

### Database (Neon)
- Neon keeps **point-in-time restore** (PITR) history automatically:
  - 1 day on the free plan.
  - Up to 7 days on Launch.
  - Up to 30 days on Scale.

  For a store that holds customer money, use at least the Launch plan.
- **Extra weekly copy**: keep one outside Neon in case the account itself has a problem.
  ```bash
  pg_dump "$DATABASE_URL_UNPOOLED" --format=custom --no-owner -f haitiviral-$(date +%F).dump
  ```
  Store it somewhere private, such as an encrypted drive or a private cloud folder. Delete copies older than 3 months.
- **Test a restore** every 3 months (section 4). A backup you have never restored is not a backup.

### Images (Vercel Blob)
- Product and brand images can be uploaded again if lost.
- Payment screenshots are evidence: they are kept in the private Blob store. Vercel Blob is durable storage, but if you want your own copy, download the `evidence/` folder from Vercel → Storage → your Blob store once a month.

### The encryption key (most important)
`ENCRYPTION_KEY` encrypts every gift-card code in the database. **If you lose it, every unsold and sold code becomes unreadable, forever.** Restoring a backup does not help.
- Copy it into a password manager, such as Bitwarden or 1Password, today.
- Also keep a second copy offline, for example written down in a safe place.
- Never change it in Vercel unless you are following section 6.

---

## 4. Restoring the database

**Undoing a mistake from the last few hours or days:**
1. Neon console → your project → **Branches** → **Create branch** → choose **"Past point in time"**. Pick a time just before the problem.
2. Open the new branch and check that the data looks right. You can point a local copy of the site at the branch's connection string.
3. Then either:
   - Copy the missing rows back into the main branch (careful work: ask your developer), or
   - Make the restored branch the primary one (Neon → branch → **Set as default**). Then update `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in Vercel to the new branch's connection strings and redeploy.

**Restoring from a `pg_dump` file (new or empty database):**
```bash
pg_restore --no-owner --clean --if-exists -d "$NEW_DATABASE_URL_UNPOOLED" haitiviral-2026-10-01.dump
```
Then set the Vercel env vars to the new database and redeploy. Use the same `ENCRYPTION_KEY` as before.

> Ledger tables are append-only (enforced by the database). A restore replaces whole tables, which is fine. Never "fix" a balance by editing rows: use Admin → Customers → Wallet adjustment, which writes a balanced, audited entry.

---

## 5. When something goes wrong

### Site is down (`/api/health` fails or pages show errors)
1. Check https://www.vercel-status.com and https://neonstatus.com.
2. Vercel → Deployments: if the problem started with the latest deploy, open the previous deployment → **⋯ → Promote to Production** (instant rollback).
3. If `db` is `down`: Neon console → is the project suspended or over quota? Check that `DATABASE_URL` uses the **pooled** (`-pooler`) host.

### MonCash payments stuck as "pending"
- The daily job (`/api/cron/maintenance`) checks MonCash for pending payments. Run it now:
  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://YOUR-SITE/api/cron/maintenance
  ```
- The customer can also press "Try again" on their order to restart the MonCash payment.
- If MonCash shows the money but our site does not, approve it manually: Admin → Payments → the payment → Approve. Put the MonCash transaction ID in the note.

### A customer says they paid but nothing happened
1. Admin → Customers → find them → Payments.
2. Compare with the NatCash/MonCash statement (Admin → Reconciliation helps).
3. If the money arrived: approve. If not: reject with a clear reason. The customer is notified either way.

### Wrong code delivered or code doesn't work
- Admin → Orders → the order → **Cancel / refund to wallet…**. The customer gets store credit straight away.
- Mark the code's batch with the supplier and import replacement codes.

### Suspected fraud or a stolen account
1. Admin → Customers → the customer → **Suspend & sign out**. This ends all their sessions at once.
2. Look at **Accounts sharing a browser or IP** on the same page and suspend linked accounts if needed.
3. Admin → Risk queue: resolve with notes.
4. Admin → Audit log: see what was done and from which IP.

### A staff account may be compromised
1. Admin → Security → **All devices** next to that person: signs them out everywhere.
2. Admin → Staff → change their role to Customer, or reset their 2FA.
3. Check Admin → Audit log for their recent actions. Big wallet changes always needed a second person (Approvals).
4. If an owner account is affected, also rotate `BETTER_AUTH_SECRET` (section 6). This signs **everyone** out.

---

## 6. Changing keys and secrets

| Secret | How to change | Effect |
|---|---|---|
| `BETTER_AUTH_SECRET` | New value: `openssl rand -base64 32` → Vercel env → redeploy | Everyone is signed out. 2FA keeps working. |
| `CRON_SECRET` | New value in Vercel → redeploy | Update any outside scheduler that calls the cron URL. |
| `MONCASH_CLIENT_SECRET` | Generate in the MonCash business portal → Vercel → redeploy | No effect on customers. |
| `RESEND_API_KEY` | Create new key in Resend, delete old → Vercel → redeploy | Check with Admin → Email → Send test. |
| `TURNSTILE_SECRET_KEY` | Rotate in Cloudflare → Turnstile → Vercel → redeploy | — |
| `BLOB_READ_WRITE_TOKEN` | Set automatically by Vercel when the store is connected | — |
| `ENCRYPTION_KEY` | **Do not change** without a re-encryption script. | Changing it makes existing codes unreadable. |
| Database password | Neon → Roles → Reset password → update `DATABASE_URL` and `DATABASE_URL_UNPOOLED` → redeploy | A short outage between the reset and the redeploy. |

After any change: open `/api/health` (with the bearer token) and Admin → Security → Services to confirm everything still shows **on**.

---

## 7. Turning on the optional services

| Service | Steps |
|---|---|
| **Email (Resend)** | Buy a domain → add it in Resend → add the DNS records → wait for "Verified" → set `RESEND_API_KEY` and `EMAIL_FROM="HaitiViral <no-reply@yourdomain.com>"` → redeploy → Admin → Email → Send test. |
| **Bot check (Cloudflare Turnstile)** | Cloudflare dashboard → Turnstile → Add site (your domain, "Managed" mode) → set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` → redeploy. Appears on sign-up, sign-in, forgot password, deposit and newsletter. |
| **Error monitoring (Sentry)** | sentry.io → new project → copy the DSN → `SENTRY_DSN` → redeploy. |
| **MonCash live** | Get live keys from Digicel → `MONCASH_MODE=live`, `MONCASH_CLIENT_ID`, `MONCASH_CLIENT_SECRET` → redeploy → do one real 50 HTG deposit and refund it to store credit. |

---

## 8. Releasing changes

1. Push to a branch. Vercel builds a preview URL.
2. Check the preview: sign in, buy something cheap with a mock payment (allowed only on previews with `ALLOW_MOCK_PAYMENTS=1`), and check the admin.
3. Merge to `main`. Vercel deploys to production and `prisma migrate deploy` runs in the build.
4. If anything looks wrong: Vercel → previous deployment → **Promote to Production**. Database migrations only ever add things, so rolling the code back is safe.
