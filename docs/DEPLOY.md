# Deploying HaitiViral to Vercel

About 20 minutes. You need a free [Vercel](https://vercel.com) account. Vercel cannot take a zip upload directly: the code goes through **GitHub** (path A, recommended) or the **Vercel command line** on a computer (path B).

---

## Step 1: Get the code into Vercel

### Path A: GitHub (works from a phone or computer)
1. Create a free account at https://github.com if you don't have one.
2. Create a new **private**, **empty** repository named `haitiviral`. Don't add a README.
3. Put the code in it:
   - **Easiest:** let Claude push it for you. Connect GitHub to Claude and give it the repository name.
   - **Yourself, on a computer with Git:**
     ```bash
     unzip haitiviral.zip -d haitiviral && cd haitiviral
     git init && git add . && git commit -m "HaitiViral"
     git branch -M main
     git remote add origin https://github.com/YOUR-NAME/haitiviral.git
     git push -u origin main
     ```
4. In Vercel: **Add New… → Project → Import** the `haitiviral` repository. Leave every setting as it is and press **Deploy**.
5. **The first build will fail with a database error. That is expected:** the database isn't connected yet. Continue with step 2.

### Path B: Vercel command line (computer, no GitHub)
```bash
unzip haitiviral.zip -d haitiviral && cd haitiviral
npx vercel login
npx vercel link        # answer Y, create a new project called haitiviral
```
Do steps 2 and 3 in the Vercel dashboard, then run `npx vercel --prod` (step 4).

---

## Step 2: Connect the database and file storage (Vercel dashboard → your project → **Storage**)
1. **Database:** Create Database → **Neon** (Postgres) → region **US East** (Washington, D.C.), the closest to Haiti → Create → connect it to the project (all environments).

   This adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` for you.
2. **Files:** Create → **Blob** → name it `haitiviral-files` → access **Private** → Create → connect it to the project.

   This adds `BLOB_READ_WRITE_TOKEN`. It holds the payment screenshots and support photos (never public) and the images you upload in Admin (service, platform and payment icons, logo). Those images are shown through the site's own `/media/…` address, so the store stays Private.

---

## Step 3: Add three secrets (Settings → Environment Variables)
Add each one for **Production, Preview and Development**:

| Name | Value |
|---|---|
| `BETTER_AUTH_SECRET` | a random secret (Claude gave you one, or run `openssl rand -base64 32`) |
| `ENCRYPTION_KEY` | a **different** random secret, made the same way |
| `CRON_SECRET` | a third random secret. It is also your one-time setup code in step 5 |

> **Save `ENCRYPTION_KEY` in a password manager now and never change it.** It locks the providers' API keys saved in Admin → Providers. If it's lost, every key has to be entered again.

Not needed for the first deploy:
- `NEXT_PUBLIC_SITE_URL`: the `….vercel.app` address is used automatically. Set it when you add your own domain.
- MonCash, Resend, Turnstile and Sentry keys: add them later. Until then:
  - MonCash is hidden.
  - Password resets go through WhatsApp.
  - The bot check and error reports stay off.

---

## Step 4: Deploy again
- **Path A:** Deployments → the failed one → **⋯ → Redeploy**.
- **Path B:** `npx vercel --prod`.

The build creates all the database tables automatically and takes about 2–3 minutes. When it's done, open `https://YOUR-PROJECT.vercel.app/api/health`. It should show `{"ok":true,"db":"up"}`.

---

## Step 5: Create your admin account (in the browser)
1. Open `https://YOUR-PROJECT.vercel.app/admin/setup`.
2. Fill in the form:
   - Setup code: the `CRON_SECRET` value.
   - Your name, email and a password of 12 or more characters.
3. Keep **Load the demo catalog** ticked if you want example services (TikTok, Instagram, YouTube, Facebook) to try the site with.
4. Sign in. Then scan the QR code with an authenticator app (Google Authenticator, Microsoft Authenticator or Authy) and **save the backup codes** it shows.

The setup page closes for good after the first admin exists.

---

## Step 6: Automatic order checks every 5 minutes
The maintenance job sends orders to the providers, follows their progress, gives partial and full refunds, and checks balances. On the free Vercel plan, Vercel runs it only **once a day** (`vercel.json`), which is far too slow.

Use a free outside timer, such as https://cron-job.org:
- URL: `https://YOUR-PROJECT.vercel.app/api/cron/maintenance`
- Every **5 minutes**
- Header: `Authorization` = `Bearer YOUR_CRON_SECRET`

On your own server (VPS) later, this becomes a normal scheduled task calling the same address.

## Step 7: Before real customers
1. Admin → Settings:
   - Your NatCash number and name.
   - WhatsApp number, business address and hours.
2. Admin → Providers: add your SMM provider as **"SMM panel"**. Paste its API address and key there, never in a chat. Press **Check balance**.
3. Admin → Services & risk:
   - Press **Sync from providers**.
   - Link each choice (Bon mache / Pi bon kalite / Rapid) to a provider service, plus a backup if you have one.
   - Check the risk levels.
4. Admin → Pricing & profit:
   - Set the HTG/USD rate and the payment fee.
   - Make sure nothing shows "Loss".
5. The fake test provider doesn't work on the live address: use a real one.
6. Test on your phone: sign up → NatCash deposit → approve it in Admin → Payments → small order → watch it reach "Konplete".
7. Point an uptime monitor (UptimeRobot, free) at `/api/health`.

## Later: your own domain
1. Vercel → Settings → Domains → add `yourdomain.com` and follow the DNS instructions.
2. Set `NEXT_PUBLIC_SITE_URL=https://yourdomain.com`, then redeploy.
3. With the domain, you can verify it in Resend and turn on email (see `docs/OPERATIONS.md` §7).

## If something goes wrong
| Problem | Fix |
|---|---|
| Build says "No database connected" | Connect the Neon database to this project for Production **and** Preview (step 2.1), then redeploy. The build accepts the usual variable names (`DATABASE_URL`, `POSTGRES_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING`) |
| Setup page: "doesn't match CRON_SECRET" | Copy the value again with no spaces. After changing a variable, you must **redeploy** |
| Setup page: "ENCRYPTION_KEY is missing or wrong" | It must be the output of `openssl rand -base64 32` (44 characters ending in `=`) |
| "Invalid origin" when signing in on a custom domain | Set `NEXT_PUBLIC_SITE_URL` to that domain and redeploy |
| Image upload says storage is not configured | Connect the Blob store (step 2.2) and redeploy |
