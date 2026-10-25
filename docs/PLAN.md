# HaitiViral: SMM panel for Haiti, plan (nothing built yet)

Updated 2026-10-22. Domain: haitiviral.com. Repo: github.com/douggue/haitiviral. A simple SMM panel like the others, for customers in Haiti, paid with Haitian payment methods only.

**Standalone project:** HaitiViral has its own repo, database, hosting and merchant accounts. It starts from a copy of the haiti-gaming foundations and does not depend on or wait for GSMLite.

- Mockup (live, clickable): https://claude.ai/artifact/L3Ld2sihR9pTGiVpC4ubBE. Source files: `docs/mockup/`
- Risk-analysis prototype: `tools/risk-analyzer-prototype.py`

## Owner's decisions (2026-10-21)
- **Providers:** universal API connector. Any provider can be added from the admin.
- **Profit:** set in the admin, both a default and per service.
- **Languages:** Kreyòl (first) and French only.
- **Minimum top-up:** set in the admin.
- **Free trial:** yes, with anti-abuse protection (see below).
- **Reseller API:** not now, maybe later.
- **Support:** WhatsApp button + tickets on the site.

## Owner's requests (round 2)
- **Icons:** in the admin, upload an icon or logo for each platform (Instagram, TikTok…) and for each payment method (MonCash, NatCash, bank). This uses the existing media library.
- **Strict mode switch:** in the admin, a simple on/off switch for "first top-up required before the trial".
- **What the trial is for:** letting a potential customer test the quality of a service before paying. The admin chooses which services offer a trial and the trial quantity, and the customer picks one.
- **Help pop-ups:** a "?" button next to things like drip-feed, refill, start count and partial. It opens a short explanation with an example. The text is editable in the admin, in Kreyòl and French.
- **Translations editable by hand:** an admin screen to change any text on the site in Kreyòl or French, without code. It already exists in your code (Admin › Translations).

## Link checking (wrong link protection)
- Each service has a **link type**, set in the admin: profile, video/post, channel, live, page, group…
- The link is checked **while the customer types it**, before payment.
  - **Wrong platform**, for example an Instagram link on a TikTok service: a red message with a correct example.
  - **Video instead of profile**, or the reverse: a red message that explains which link is needed.
  - **Correct link:** a green tick, plus a reminder that the account must be PUBLIC.
- The label and example change with the service: "Lyen pwofil ou" or "Lyen videyo a".
- **Short links** (vm.tiktok.com, youtu.be, fb.watch) are opened and turned into the full link. Tracking extras such as `?igsh=` are removed.
- **Optional check that the profile exists and is public** before ordering. If the account is private, the order is blocked with a clear message.
- **Duplicate warning:** if the same link already has a running order on the same service, the customer is warned, because providers often refuse or mix up two orders on one link.
- The error messages are editable in the admin (Translations).

## Live stream viewers (concurrent viewers)
- A **"Live"** service type for TikTok, YouTube, Facebook, Instagram, Twitch and Kick. The quantity is the number of people watching **at the same time**.
- **Duration choice** (15 min, 30 min, 1 h, 2 h…): each duration is linked to the provider's matching service, or uses a duration field when the provider asks for one. The price adjusts automatically.
- **Link:** profile or live link (a video link is rejected).
- **Clear warning:** "Kòmande sèlman lè ou deja an live". Viewers arrive in 1–5 minutes, and if the live ends early the remaining time is lost. No refill and no drip-feed for this type (drip-feed is hidden).
- **Admin:** set the service type to "Live", list the durations with their prices, and set a policy for refunds and cancellations.
- **Later idea:** "Schedule a live": the customer gives a start time, and the order is sent automatically at that time.

## Provider availability check (2026-10-21)
Checked on the public service list of one large provider (MoreThanPanel, about 40 MB of listings) plus a few others' pages.

| Service | Found? |
|---|---|
| TikTok / Instagram / Facebook / YouTube live viewers | ✅ Facebook in 15, 30 and 60 min versions. TikTok live views + likes + comments + shares. Instagram live. YouTube live (incl. custom comments) |
| TikTok custom comments | ✅ (several, incl. "TikTok French Comments") |
| Instagram / Facebook comment likes | ✅ |
| TikTok comment likes | ⚠️ not found at this provider. Some others advertise it; check before selling |
| TikTok live *custom* comments | ⚠️ only "live views + 3 English/Turkish comments" combos found. YouTube live custom comments exist |
| Mentions (custom list), poll votes, subscriptions / auto-likes | ✅ |
| Kreyòl comments | ❌ no provider offers ready-made Kreyòl comments. **Custom comments work**, because the customer writes the Kreyòl text |

**Rule:** the site only shows services that a connected provider really sells. A special type that no provider offers simply doesn't appear.

**To do (owner):** open free accounts with 2–3 providers, look at their full lists, and test each service type with $5–10 before launch.

**Funding providers:** providers are paid in USD, mostly by crypto (USDT), card, Payeer or Perfect Money. Check which one works for you from Haiti.

## Login options (decided: email + password, and Google)
- **Email + password** (existing) and **"Continue with Google"**, which is **free**. It's built into Better Auth. Setup: a Google Cloud project with an OAuth client and consent screen. The keys go in the hosting environment variables only.
- Basic Google login (name, email, photo) needs no paid verification and has no cost per user.
- Optional later: Facebook login (free); Apple login (needs the Apple Developer account, $99/year).
- A Google account counts as email-verified. The free-trial and referral protections (phone, device, profile link) still apply.

## Referral program
Built on the existing referral code (`src/lib/referrals.ts`: codes, store-credit reward, same-network check), changed to fit an SMM panel:
- **Commission on spending:** the referrer earns a % (e.g. 5%, set in the admin) of what the people they invited **spend on completed orders**. This is for life, or for X months (admin setting).
  - Based on spending, not deposits, so refunded and cancelled orders earn nothing.
  - Partial orders earn only on the delivered part.
- **Paid as wallet credit,** usable for orders. An optional cash-out to MonCash or NatCash above a minimum (e.g. G 2,500) can be added, with admin approval.
- **7-day waiting period** before commission becomes available, so refunds and abuse can be caught first.
- **Welcome gift for the invited person** (optional), e.g. +5% on the first top-up.
- **Levels (optional):** 5 active referrals → 6%, 20 → 8%…
- **Customer page:** personal link + **WhatsApp / Facebook / copy** buttons, number invited, number active, money earned and pending.
- **Anti-abuse:** the same protections as the trial (device, phone, IP, same network = no commission). Free-trial orders never count. Suspicious referrals go to the admin.
- **Admin:** turn on/off, %, duration, waiting period, minimum cash-out, list of referrers with earnings, block a referrer.

## Risk labels and "at your own risk" notice
**Providers don't give a safety or risk rating in the API.** The `services` list only gives name, category, type, rate, min, max, refill and cancel, sometimes with a description. The only hints are words in the service name ("Real", "Bot", "No Refill", "Low Drop", "Non Drop", "HQ"…). So **HaitiViral sets its own label:**
- Each service gets a **risk level in the admin**:
  - 🟢 Low: real or slow delivery, refill;
  - 🟡 Medium;
  - 🔴 High: bots, very fast, no refill, drops likely.
- When a service is synced, the site **suggests** a level from the words in its name, and you confirm it.
- The customer sees the label on each service, with a **?** pop-up explaining it.

**Automatic risk analysis (tested 2026-10-21 on 3,921 real services from one provider: 1,828 Low / 1,911 Medium / 182 High):**
- Each clue adds or removes points. The score gives a level: ≤ −2 = 🟢 Low, ≥ +2 = 🔴 High, anything in between = 🟡 Medium.

| Clue in name / description / API | Points |
|---|---|
| "bot", "fake" | +3 |
| "no refill", "no guarantee"; "not working", "unstable", "test" | +2 |
| "drop" (not "non/low drop"); "instant / super fast / 10K+/day"; "cheap", "LQ", "mixed"; API `refill=false` | +1 |
| "real", "active", "organic" | −2 |
| "refill", "R30", "lifetime" | −2 |
| "non drop / low drop"; "guarantee"; "HQ / premium / VIP"; slow speed ("50-500/day"); "targeted / country" | −1 |

- **Admin screen per service:** the suggested level, the **reasons** ("+3 bot, −2 refill…"), a dropdown to **change it**, and a **lock** so the next sync doesn't overwrite your choice.
- **Editable rules:** add, remove or change words and points, then "Re-analyze all". Every change is saved in the audit log.
- **Learns from real results:** if a service gets many partial orders, refill requests or complaints, the site suggests raising its risk level, and you confirm.
- **"Blocked" level** for categories you never want to sell, even if a provider offers them. The suggested default list includes **fake reviews** (Google, Trustpilot…), which are illegal in many countries. The test list had "Google Custom Reviews".
- "Real" in a provider's name is marketing and not proof, so the analysis is only a suggestion. You always have the final say.

**Legal protection:**
- **Terms of service** checkbox at sign-up (Kreyòl + French). It states:
  - HaitiViral is not linked to TikTok, Instagram, Facebook or YouTube;
  - the platforms can remove followers, likes or views, or limit the account;
  - the customer uses the services **at their own risk**;
  - the account must stay **public** and the username must not change during the order;
  - refunds only happen when the provider fails to deliver (partial or cancelled), not for drops after completion (refill covers that when the service has it).
- **For 🔴 High-risk services, an extra checkbox on each order:** "Mwen konprann risk yo…". The date and time of acceptance are saved on the order as proof.
- **Short FAQ:** "Èske kont mwen ka gen pwoblèm?" with an honest answer.
- All of these texts are editable in the admin (Translations / Pages).

## Special service types (order form changes by type)
The provider's service list says which type each service is. The form shows the right fields automatically, and the admin can change the type.

| Type | What the customer enters | Sent to provider |
|---|---|---|
| Default | link + quantity | `link`, `quantity` (+ `runs`, `interval` for drip-feed) |
| **Custom comments** | link + their comments, **one per line** (quantity = number of lines) | `comments` (one per line) |
| **Live comments** | live/profile link + comments, one per line, with a LIVE warning | `comments` |
| **Comment likes** | video link + the username of the comment author | `username` |
| Comment replies | link to the comment + replies, one per line | `username`, `comments` |
| Mentions | link + list of usernames, or hashtag | `usernames`, `hashtags` / `hashtag` / `username` / `media` |
| Poll votes | poll link + answer number | `answer_number` |
| Package | link only (fixed amount) | `link` |
| Live viewers | link + quantity + duration | per-duration service or `duration` field |
| Subscriptions / auto-likes | username + min/max per post + number of posts + delay + days | `username`, `min`, `max`, `posts`, `delay`, `expiry` |
| Search / SEO | link + keywords, one per line | `keywords` |

**Comments rules:**
- **One per line, not commas,** so a comment like "Kontinye konsa, frè m" can keep its comma. If a customer pastes a single line containing commas, the site offers to "split at the commas".
- **Quick-add buttons** (Bèl!, Bravo…), editable in the admin.
- **Cleaned automatically:** duplicate lines and empty lines are removed, and there's a maximum length per comment.
- **Blocked words list** in the admin (insults, phone numbers, links).
- Emoji allowed.

## PWA (installable app), required
Reused from haiti-gaming, which already has it: `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`, icons, iPhone splash screens and `src/lib/pwa-client.ts`.
- **"Install HaitiViral" banner:**
  - Android: one tap to install.
  - iPhone: a short picture guide (Share → Add to Home Screen).
- **Opening from TikTok, Instagram or Facebook:** the in-app browsers of these apps can't install a site. The site detects this (already in the code) and shows "Open in Safari / Chrome" first. This matters a lot here, because many customers will click our links inside those apps.
- **Opens full screen** with no browser bar, plus a HaitiViral icon and splash screen, all regenerated from the logo uploaded in the admin.
- **Push notifications:** order completed, partial refund, deposit confirmed, promotions. On iPhone this only works once the app is installed (iOS 16.4 and newer).
- **Offline page** when there's no connection. Pages load fast thanks to caching.
- **Shortcuts:** a long press on the icon gives "New order", "My orders" and "Add funds".
- Wallet and order pages are never cached, so balances are always live.

## Free trial protection
- **One trial per social media profile.** The same link can never get two trials, however many accounts someone creates. This is the strongest rule.
- **One trial per verified phone number,** confirmed with an SMS or WhatsApp code.
- **One trial per device,** using the device check already built in your code.
- **Limit per internet connection:** a maximum number of trials per IP address per day.
- **Bot check** on sign-up (Cloudflare Turnstile, already built) and email verification (already built). Disposable email addresses are blocked.
- **Trial queue:** trials are delivered with a short delay. Suspicious ones go to the admin for approval, and the existing risk flags handle this.
- **Admin settings:** turn the trial on or off, choose which service and quantity, set a daily limit, and optionally require "first top-up before the trial".

## How it works
1. The customer creates an account and adds money to their wallet with MonCash, NatCash or a manual payment.
2. They choose a service (for example "1,000 TikTok followers"), paste their link and choose a quantity.
3. The site sends the order to a provider automatically and follows its progress.
4. The provider delivers. We keep the difference between our price and theirs.

## Payments (Haiti only)
- **MonCash** (automatic, already built in your code)
- **NatCash** (already built)
- **Manual methods** with a proof upload, for example a bank transfer or Sogebank (already built)
- Prices shown in **HTG**. Providers charge us in USD, so the site converts using an exchange rate you set in admin.

## Reused from your existing code
Login with 2FA, the HTG wallet and ledger, automatic refunds, notifications, the installable app, support tickets, referrals, the full admin, staff permissions, and the language system (used for Kreyòl + French only).

## What we add
- **Universal provider connector** (owner's choice). Add any provider from the admin with no code: paste its API address and key.
  - Works with every provider that uses the standard SMM API (almost all of them).
  - Providers with a different API use a template system (design notes: `docs/supplier-connector-plan.md` in the haiti-gaming repo).
  - Unlimited providers, a "Test" button, balance shown per provider, a backup provider per service.
  - It places orders, checks their status, requests refills and cancellations, and reads our balance with each provider.
- **Service sync:** import the provider's service list in one click and set your profit (for example +60%).
  - If a provider raises its price, the service pauses automatically so you never sell at a loss.
- **Automatic order follow-up:** the site checks providers every few minutes.
  - **Completed:** done.
  - **Partial:** the customer is refunded for the part that wasn't delivered.
  - **Canceled:** full refund to the wallet.
- **Refill button** for services with a refill guarantee, so customers can ask for dropped followers to be topped up.
- **Delivery in steps (drip-feed):** for example 100 likes every hour.
- **Low-balance alert** when your balance with a provider gets low.

## Customer side (phone first)
- Simple order page: platform, then service, then link and quantity, with the price shown live in HTG.
- "My orders" with a progress bar, a refill button and an "order again" button.
- Mass order (many links at once). Reseller API: later.
- Referral bonus and coupons; a bonus for larger top-ups.

## Admin side
- Providers: add a provider, test it, see its balance.
- Services: categories, prices, translations, turn on and off.
- Orders: stuck orders, re-send, refund by hand.
- Daily profit: sales, cost and profit.

## Review (2026-10-21): fixes to apply
1. **Money flow HTG → USD:** customers pay in HTG (MonCash/NatCash), providers want USD (USDT…). Plan how and how often the money is converted, and keep a provider balance buffer. When a provider balance is too low, orders wait in a "waiting for balance" queue and are not refused. Each order saves the exchange rate used. The profit check uses today's rate.
2. **Margin stacking:** markup minus referral 5%, top-up bonus 5%, free trials and the payment fee must stay profitable. The admin shows the **real profit after all of these** per service and warns below a minimum.
3. **Order screen too long:** add a category step (Abòne / Like / Vi / Kòmantè / Live) and search. Show **3–5 hand-picked services per category** (e.g. "Bon mache / Pi bon kalite / Rapid"), not thousands. Fewer badges; details go in a "?" pop-up.
4. **Risk analysis:** add weight by service kind (followers riskier than views) to avoid false "High" results.
5. **Profile "public/exists" check:** TikTok and Instagram block automated checks, so it's unreliable. Keep it optional or skip it at launch. Short-link expansion and any profile fetching must go only to the known platform domains (security).
6. **Hosting (decided):** Vercel is **for testing only**. HaitiViral gets **its own VPS / droplet** (DigitalOcean, Linode, Vultr…) in production.
   - On the VPS, a background worker checks providers every 2–5 minutes, with a fixed IP for providers that require one.
   - On Vercel (testing), use a "Check now" button in the admin plus a free external scheduler that calls a secret endpoint.
7. **Standalone copy of the haiti-gaming foundations:** fixes made in haiti-gaming don't reach HaitiViral automatically. Accept this; copy important security fixes by hand when needed.
8. **MonCash/NatCash merchant terms:** still worth one question to Digicel and Natcom. If the account were closed, all payments would stop.
9. **Missing screens in the mockup:** sign-up/login (email + Google), free-trial page, support/WhatsApp button, account/settings, language switch, notifications, cancel button.
10. **Kreyòl wording** in the mockup: have it checked by a native speaker (owner).

## Better ideas
- **Real average completion time per service,** calculated from our own orders (e.g. "Mwayèn: 2 èdtan"). This is a strong trust signal.
- **Starter packs:** for example TikTok Starter = followers + likes + views in one order at a small discount.
- **VIP levels by total spending** (lower prices). This replaces the reseller API for now.
- **Status page** ("all services normal") to reduce WhatsApp questions.
- **Order lookup by number** in support tickets and WhatsApp replies.

## Launch scope (MVP) vs later
- **Launch:** default services, custom comments, live viewers, drip-feed (when the provider allows it), refill/cancel, link checking, risk labels + consent, free trial (views/likes only), simple referral, email + Google login, MonCash/NatCash/bank, PWA, Kreyòl + French, universal connector, admin.
- **Phase 2:** comment likes, live comments, mentions, polls, auto-likes subscriptions, "learned" risk suggestions, starter packs, VIP levels, scheduled live orders.
- **Later:** reseller API, child panels, referral cash-out.

## Build order
1. Copy the foundations, rebrand, and remove the game-code parts.
2. Provider connection and service sync.
3. Orders, automatic refunds and refills.
4. Customer screens, then admin screens.
5. Preview link → you test on iPhone → "ship it".
