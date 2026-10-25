# Next changes (noted with the owner, not built yet)

Status: **noted only**. Nothing here is built. The owner decides the order before work starts; changes go to the preview branch and reach `main` after "ship it".

1. **Clean the admin.**
   - Remove what an SMM panel doesn't need, and every Haiti Gaming leftover: `hg_` names, gift-card and game wording.
   - Keep Code inventory, adapted to deliver accounts.
2. **Sell accounts.**
   - To decide: which categories, warranty and replacement, own-risk consent.
   - Unblock "account sale" in the risk rules for this section only.
3. **Accounts provider: YTSeller** (`https://ytseller.com/api/v2`, same style as SMM API v2).
   - **Catalog:** Gmail, YouTube channels, Facebook, Apple ID, Discord, Instagram, X, TikTok, Reddit…, $0.27–$110 each.
   - **API actions:** `products`, `add_product_order` (with `trans_id` = our reference, so a resend never buys twice), `product_order_status`, `result_product` (delivered lines), `balance`.
   - **Pricing and stock:** a per-piece price (not per 1,000); stock and sold-out synced.
   - **Delivery:** login details stored encrypted; "Instant" vs "Within 24h"; ask the customer for any `require` field.
   - **Customer help:** a 2FA code tool on the order page, and a Kreyòl/French first-steps guide (change the password and recovery email, turn on 2FA).
   - **Still to get:** their warranty terms in writing (their warranty page is still a template).
4. **SMS verification numbers (YTSeller).** US numbers for Gmail ($0.44), Discord ($0.09), Telegram ($0.33) and Instagram ($0.09): reusable, expire after a few months, no warranty.
   - Show the codes on our own order page; hide the YTSeller link if it can be read automatically.
   - A clear no-warranty warning and consent.
   - A minimum price in HTG.
5. **Service descriptions.**
   - A short Kreyòl/French text per choice, pre-filled from the provider and editable.
   - Automatic warnings per kind of service: public profile, speed can change, don't change your username.
   - Block a second order on the same link and service while one is running.
   - Never show the provider's service number or name.
   - **Service details card shown before ordering,** right on the order screen (not hidden behind "?"), as small tiles with icons:
     - Quality (Real / Mixed / Bot)
     - Speed (e.g. 300K/day)
     - Start time (e.g. 0–5 min)
     - Guarantee / refill (30 days / No refill)
     - Drop rate (Non drop / Low drop)
     - Link to give (profile / post)
     - Cancel button (yes/no)
     - Refill button (yes/no)
     - Location (global / country)
     - Filled from the provider data and the risk analysis, editable in the admin; the colors follow the risk level.
   - **"Li anvan ou kòmande" (read before ordering) tab/page,** in Kreyòl and French:
     - What each status means: An atant (pending), Ap trete (in progress), Konplete (completed), Pasyèl (partial, the rest refunded automatically), Anile (canceled, fully refunded).
     - The refund policy in plain words.
     - How to order correctly: grow naturally (don't buy 50K on a 100-follower account), one order at a time per link, don't use another SMM site on the same account at the same time, keep the account public.
     - When to open a ticket (with the order number).
   - **"Nouvèl sèvis" (service updates) tab,** optional: new services, price changes and paused services, fed by the provider sync alerts (#7).
6. **Smarter link check** (the basic profile-vs-video check already works).
   - Follow short links (vm.tiktok.com, youtu.be, fb.watch).
   - Instagram reel vs photo; YouTube video vs Shorts, per service.
   - Accept "@username" for followers.
   - Live-link check.
   - A "my account is public" checkbox.
7. **Easier service import.**
   - Pick from search cards instead of typing numbers, with smart suggestions per tier (Bon mache / Pi bon kalite / Rapid).
   - Compare providers side by side.
   - A suggested price (cost + target profit) on the same screen.
   - Create a new service in one go.
   - Change alerts after each Sync.
8. **Starter packs done right.**
   - **Price:** contents − pack discount, with a true "was" price.
   - **Links:** one profile link, plus video links one per line. Likes and views are spread evenly; the max number of videos comes from the provider minimums and an admin cap; every video is checked to be from the same account.
   - **Delivery:** automatic provider orders per video, with per-part refunds; one "My orders" card with a line per video.
   - **Admin:** packs built in the admin, with an optional "new customers only" limit.
9. **Currency.** Amount first, then HTG (e.g. `1,250 HTG`) everywhere: customer screens, notifications, emails, admin. Never "G".
10. **Referral program.** Mockups: `docs/mockup/ReferralVisitor.dc.html` (public page) and `docs/mockup/Referral.dc.html` (customer page).
    - **Commission:** a % per order of direct friends only (no multi-level).
    - **Earnings balance:** separate from the wallet, the only money that can be withdrawn. Commissions are held until the order is completed + 3 days, and canceled on refund.
    - **Withdrawals:** to MonCash/NatCash, to the number in the account (same name), approved by staff, paid within 24 h. Or moved into the wallet straight away.
    - **Minimum payout (required):**
      - Set in the admin (decided: **1,000 HTG**), and shown on both referral pages and in the withdrawal panel.
      - The "Retire lajan" (withdraw) button stays off below it, with "X HTG ankò pou w ka retire" (X HTG more before you can withdraw).
      - Optionally a different minimum for MonCash and NatCash, if their transfer fees differ.
      - No minimum for moving earnings into the wallet.
    - **Tiers** over the last 30 days:

      | Tier | To reach it | Commission |
      |---|---|---|
      | Bwonz | from the start | 5% |
      | Ajan | 5 active friends or 10,000 HTG | 7% |
      | Lò | 20 active friends or 50,000 HTG | 10% |
      | Dyaman | 50 active friends or 150,000 HTG | 12% |

    - **Anti-cheat:** the free-trial checks (same phone, device, IP).
    - **Profit check:** the highest tier is counted in Pricing & profit.
    - **To confirm:** the percentages, the hold, the payout time. (Minimum payout decided: 1,000 HTG.)
11. **Dark theme for the customer app.**
    - Today a dark mode exists underneath (from the old foundations: a `hg_theme` switch, dark colors), but the new screens built from the mockup use fixed light colors (white cards, light grey backgrounds) in about 14 files, so they would look broken in dark.
    - **Switch** in Kont (Account): Klè / Fonse / Otomatik (follows the phone). Remembered per person; light stays the default.
    - **Every screen checked in dark:** home, new order (including risk colors and the "?" sheets), my orders (progress colors), wallet, referral, trial, help, notifications, login.
    - **Installed app (PWA):** status bar and splash color follow the theme.
    - **Optional:** add dark versions of a few screens to the mockup first, to agree on the look.
12. **Real MonCash and NatCash logos everywhere.**
    - The real logos came with the Haiti Gaming foundations (`public/brand/moncash.webp`, `public/brand/natcash.webp`, `PayLogo` component), but only the old checkout and guide pages use them.
    - The new screens show red "MC" / orange "NC" letter tiles or text labels instead: Wallet (top-up picker), referral pages, the withdrawal panel, home.
    - Use the real logos on every screen where a payment method appears, including the bank-transfer logo set in Admin → Payment methods.
    - Keep them sharp and readable in dark theme (#11): a white rounded background behind each logo.
13. **Secure anti-cheat for the free trial.**
    - **Today:**
      - One trial per account, phone, exact link and browser cookie (`hg_dev`); daily limits per IP and in total; strict mode (first top-up required); staff approve each one.
      - **Weak points:**
        - The phone isn't verified: any number can be typed.
        - The cookie is erased by a private tab.
        - The link check is per exact URL, so another video of the same account passes.
        - Mobile internet in Haiti puts many people behind the same IP (risk of blocking honest people), while a VPN changes IP easily.
    - **Planned layers:**
      1. **Verified phone:** a code by WhatsApp (or SMS) before the trial; one trial per verified number. Lowest-cost option: WhatsApp Cloud API authentication messages.
      2. **One trial per social account,** not per link: links are reduced to the account (TikTok @name, Instagram username, YouTube channel) after following short links (#6), so a second video of the same account is refused.
      3. **Stronger device ID:** the same ID kept in a cookie, local storage and IndexedDB, plus a light browser fingerprint (screen, time zone, language, graphics); clearing one isn't enough.
      4. **Network checks:** VPN/proxy/datacenter IPs refused for the trial; ordinary IPs used as a signal only (shared mobile IPs aren't blocked outright).
      5. **Bot check:** Cloudflare Turnstile on the trial form (already in the code, off until keys are added).
      6. **Account checks:** verified email or Google login required; very new disposable email domains refused.
      7. **Risk score:** each signal adds points. Low = automatic approval, medium = staff review, high = refused with a polite Kreyòl message. Strict mode stays as a switch.
      8. **Admin view:** for each request, the accounts sharing the same phone, device, IP or social account, with ban/allow buttons.
    - **The same signals protect the referral program (#10):** no commission between linked accounts.
    - **Services:**
      - **Phone code (decided: WhatsApp, the customer sends the code):** the customer *sends* a code to our WhatsApp Business number (a "click to WhatsApp" message with the code pre-filled), received through Meta's WhatsApp Cloud API. Messages customers send are normally free on Meta's platform, and it proves they own the number. Needs a Meta business account and a dedicated number.
      - **Alternatives:** we send the code by WhatsApp (Meta authentication rate for Haiti; Twilio Verify adds about $0.05 per verification). SMS to Haiti is expensive (about $0.29 per message listed by one provider): avoid.
      - **Bot check:** Cloudflare Turnstile (free, already in the code).
      - **VPN / proxy check:** proxycheck.io, VPNAPI.io or IPQualityScore (free tiers, about 1,000 lookups a month for IPQS). Confirm current prices before signing up.
      - **Device ID and disposable-email list:** built in, free.
    - **To decide:** the phone number dedicated to WhatsApp Business, and whether low-risk trials are approved automatically.

14. **Community links bar** (seen on smmresellershub.com; the other ideas there were declined: subscriptions, mass order, "Ask AI", refill/refund pages).
    - A row of icons at the bottom of the menu (and in the footer on computer): WhatsApp channel, Telegram, Facebook, TikTok, Instagram, Google reviews…
    - Links and on/off for each set in the admin; icons hidden when no link is set.
    - Opens in the app (WhatsApp, Telegram) on phones.

## Waiting on preview (not on `main` yet)
- One Private Blob store for every upload (public images served through `/media/…`).
- `docs/DEPLOY.md` updated: Private Blob, the 5-minute order check with cron-job.org, SMM steps.
