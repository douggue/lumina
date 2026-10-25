# Lumina — YTSeller + trial anti-cheat (Backend contract)

Branch: `preview/foundations` (not on `main` until Lead ships).

## A) YTSeller accounts + SMS

**Preset:** `ytseller` (Admin → Suppliers → Add → “YTSeller (accounts + SMS numbers)”).
**Base URL:** `https://ytseller.com/api/v2` (form POST, `key` + `action`, same style as SMM v2).

| Action | Purpose |
|---|---|
| `products` | Catalog sync → `ProviderService` (per-piece `rate`, `max` = stock, `desc` holds `kind:account\|sms` + `require:…`) |
| `add_product_order` | Place order; **`trans_id` = our `SupplierOrder.ref`** (idempotent; never double-buy on resend) |
| `product_order_status` | Poll |
| `result_product` | Delivered login / SMS lines → stored as `CodeItem.codeEncrypted` (AES-GCM) |
| `balance` | Provider balance |

Fulfillment: preset routed in `src/lib/suppliers/orders.ts` via `ytseller-orders.ts` (parallel to SMM). Customer sees codes on the order page like other `CODE_INVENTORY` / supplier deliveries.

**SMS / no-warranty:** mark product fields with a consent checkbox; persist `fieldValues.noWarrantyAcceptedAt` on the order line (Frontend). Min HTG = normal product price / markup.

**Env:** supplier `apiKey` in Admin (encrypted). No new process env required for YTSeller itself.

## B) Trial anti-cheat

### WhatsApp inbound verify
- `POST/GET /api/whatsapp/webhook` — Meta Cloud API hub challenge + inbound text → marks `PhoneVerification.verifiedAt`.
- Actions (Frontend): `startWhatsAppVerify` / `pollWhatsAppVerify` → `PhoneVerification` via `src/lib/whatsapp-verify.ts`.

| Env | Purpose |
|---|---|
| `META_WHATSAPP_TOKEN` | Cloud API token |
| `META_WHATSAPP_PHONE_NUMBER_ID` | Sending number id |
| `META_WHATSAPP_VERIFY_TOKEN` | Webhook verify token |
| `META_WHATSAPP_DISPLAY_NUMBER` or settings `whatsappNumber` | wa.me click-to-chat digits |
| `WA_VERIFY_STUB=1` | Enable verify flow without Meta (local/dev) |

When tokens are missing, verify is off (`whatsappVerifyEnabled() === false`); `trialRequirePhoneVerified` does not hard-block.

### Social-account key
After short-link resolve + `checkLink`, `socialAccountKey(url, platform)` stores e.g. `tiktok:@name` on `TrialRequest.socialAccountKey` (**unique**). Second video of same account → `used`.

### VPN / risk
- `PROXYCHECK_API_KEY` or `VPNAPI_KEY` — optional; unset → signal `unknown`, no hard block unless configured.
- Settings: `trialBlockVpn`, `trialRequirePhoneVerified`, `trialRiskAutoMax`, `trialRiskRefuseMin`, `trialAutoApprove`.
- `requestTrial` scores signals → `risk` refuse / `vpn` block / auto-approve when band `auto`.

### Error codes from `submitTrial` / `requestTrial`
`off | first_topup | used | link | phone | phone_verify | limit | offer | vpn | risk`

### Migration
`prisma/migrations/20261025220000_ytseller_trial_anticheat` — TrialRequest columns + `PhoneVerification`.

## Residual risks
- YTSeller live field names may differ slightly; Admin “Test balance” + Sync will surface mapping gaps.
- Instagram/YouTube **video** URLs without channel id fall back to media/video keys (not the channel) — profile/follower trials are the strong case.
- Auto-approve is **off** by default (`trialAutoApprove: false`).
- Device id still primarily `hv_dev` cookie; multi-storage hash not required for this slice.
