# Universal supplier connector: research and plan

Status: built on 2026-10-21 (Admin → Suppliers). Code: `src/lib/suppliers/` (engine, templates, presets, order flow),
`src/actions/suppliers.ts`, `src/app/admin/(panel)/suppliers/`, callback `src/app/api/suppliers/callback/[token]`,
fake supplier for tests `src/app/api/suppliers/mock/[op]` (preset "mock"), tests `tests/supplier-template.test.ts`, `e2e/suppliers.spec.ts`.

How to connect a supplier: Admin → Suppliers → Add (pick its type) → enter its keys → Test → switch it on →
in Admin → Products set delivery to "Supplier API" and pick the supplier + its product code on each option.
Presets are starting points from public docs: compare with the supplier's current docs and use the Test buttons first.

## Suppliers studied (public docs)

| Supplier | Kind | Auth | Format | Our reference field | Status values → done | Codes | Callback |
|---|---|---|---|---|---|---|---|
| Reloadly | airtime + gift cards | OAuth2 client credentials, one token per audience (topups / giftcards), `Accept: application/com.reloadly.<product>-v1+json` | JSON | `customIdentifier` | SUCCESSFUL / PROCESSING, PENDING / FAILED, REFUNDED | gift cards: separate `GET /orders/transactions/{id}/cards` | HMAC-SHA256 hex of `rawBody:timestamp`, headers `X-Reloadly-Signature`, `X-Reloadly-Request-Timestamp` |
| Ding Connect | airtime | header `api_key` (or OAuth2) | JSON, PascalCase | `DistributorRef` | ProcessingState Complete(d) / Submitted, Processing / Failed, Cancelled | `TransferRecord.ReceiptParams.pin` | deferred mode, format unverified |
| DT One (DVS) | airtime + PINs | Basic (key:secret) | JSON | `external_id` (≤40) | status.class COMPLETED / CREATED, CONFIRMED, SUBMITTED / REJECTED, CANCELLED, DECLINED | `pin.code`, `pin.serial` | full transaction POST to `callback_url` |
| MooGold | game top-ups + vouchers | Basic(partnerId:secret) + headers `timestamp`, `auth = hex(HMAC_SHA256(secret, rawBody + timestamp + path))` | JSON, always POST, `path` repeated in body | `partnerOrderId` (dup = err 420) | completed / processing / incorrect-details (failed, not refunded), refunded | `item[].voucher_code[]` | unsigned JSON, reply `{"status":"success"}` in 5 s |
| UniPin | game top-ups | headers `partnerid`, `timestamp`, `path`, `auth = hex(HMAC_SHA256(secret, partnerid + timestamp + path))` | JSON | `reference_no` (dup = 708) | status 1 / 0 (synchronous) | — | none documented |
| SEAGM | top-ups + cards | `uid`, `timestamp`, `signature = hex(HMAC_SHA256(secret, sorted k=v&...))` in query/body | form | `mch_order_id` | status_code 10003 done / 10001, 10002 / 10004 refunded | `cards[{card_number, card_pin, expired}]` | HMAC of sorted fields, reply `success` |
| Smile.one | game top-ups | `sign = md5(md5(sorted k=v& + key))` (from community libs, verify) | form, region in URL | unverified | unverified | — | unverified |
| Digiflazz | top-ups | `sign = md5(username + apiKey + ref_id)` | JSON | `ref_id` (re-send = status check) | Sukses / Pending / Gagal + rc codes | `sn` | HMAC-SHA1 `X-Hub-Signature` |
| VIP Reseller | game top-ups | `sign = md5(API_ID + API_KEY)` | form | — | success / waiting, processing / error | — | static header + IP |
| SMM / reseller panel v2 | many small panels | `key` in form | form, `action=add|status|balance|services` | none (never auto-retry add) | Completed / Pending, In progress, Processing / Canceled, Partial | — | none, poll only |
| Bamboo Card | gift cards | Basic | JSON | `RequestId` (true idempotency) | Succeeded / Created, Processing, Pending / Failed, PartialFailed | `GET /orders/{requestId}` items[].cards[] | Svix HMAC |
| Prepaid Forge | gift cards | login → token header `X-PrepaidForge-Api-Token` | JSON | `customOrderReference` | sync | inline `code` / image link | none |
| Tillo | gift cards | HMAC-SHA256 headers `API-Key`, `Signature`, `Timestamp` over `apiKey-METHOD-slug-client_request_id-brand-timestamp` | JSON | `client_request_id` | success / PENDING / ERROR (+ app codes) | inline | RSA-PSS (custom) |
| Kinguin | game keys | header `X-Api-Key` | JSON | `orderExternalId` | completed / processing / canceled, refunded | `GET /v2/order/{id}/keys` paged | shared secret header |
| Eneba | game keys | OAuth custom grant | GraphQL | none | action/order/export states | zipped export (custom code) | none for buyers |
| Razer Gold, Codashop | — | reseller docs private | | | | | |

## Connector design (to build)

1. Suppliers screen (Admin): base URL, auth type (API key header / Bearer / Basic / login-token with refresh / signed requests), signature presets (MooGold, UniPin, SEAGM, Smile.one, Digiflazz, Tillo, VIP, plain key), encrypted secrets.
2. Operations per supplier: create order, check status (by our ref or theirs), balance, validate player, get codes, catalog. Each = method + path + body template (JSON / form / query) with placeholders: `{{ref}} {{sku}} {{playerId}} {{zoneId}} {{quantity}} {{amount}} {{supplierOrderId}} {{callbackUrl}} {{timestamp}} {{secret.*}}` and filters `md5 sha1 sha256 hmac base64 upper urlencode json join`.
3. Response mapping: JSON paths for order id, status, code, message, codes (code/pin/serial/expiry/url/image), balance; error detection (HTTP code, error key, result=false, rc codes); status table → SUCCESS / PENDING / FAILED_FINAL / FAILED_RETRYABLE / UNKNOWN (unmapped = UNKNOWN).
4. Presets: MooGold, Reloadly, Ding, DT One, SEAGM, Bamboo, SMM panel v2, Digiflazz.
5. Per product option: supplier + supplier product code (+ field names for player/zone), optional player-name check before payment.
6. Safety: one reference per order line reused on every retry; timeouts / 5xx / unreadable = UNKNOWN → status check, never blind refund or re-send; refund only on FAILED_FINAL; callbacks verified then re-confirmed by polling; stuck orders list for staff; fallback to manual delivery.
7. Ops: Test button with raw reply, request log (secrets redacted), low-balance alert, nightly reconciliation cron, fake "test supplier" for end-to-end tests.
8. Note: most suppliers require a fixed outbound IP (allowlist). Vercel needs a static-IP add-on or a small proxy.

Custom code still needed for: Eneba (GraphQL + zip export), Tillo webhooks (RSA-PSS), private APIs (Razer Gold, Codashop).

Raw research notes from 2026-10-16 were in the session scratchpad (not kept); this file is the summary.
