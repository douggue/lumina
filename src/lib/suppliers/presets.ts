import type { SupplierConfig } from "./types";

/**
 * Starting points for known suppliers, from their public API docs (docs/supplier-connector-plan.md).
 * Field names change between API versions: before going live, compare with the supplier's current docs and use
 * the Test buttons in Admin → Suppliers. Everything here can be edited per supplier in Admin.
 */
export type Preset = { label: string; baseUrl: string; config: SupplierConfig; skuHelp: string };

const basic = (user: string, pass: string) => `Basic {{secret.${user} | append:':' | append:secret.${pass} | base64}}`;

export const PRESETS: Record<string, Preset> = {
  generic: {
    label: "Generic JSON API (API key header)",
    baseUrl: "https://api.supplier.example/v1",
    skuHelp: "The supplier's product code",
    config: {
      secrets: ["apiKey"],
      order: {
        method: "POST",
        path: "/orders",
        headers: { "X-Api-Key": "{{secret.apiKey}}" },
        body: { reference: "{{ref}}", product: "{{sku}}", quantity: "#{{quantity}}", player_id: "{{fields.playerId}}", zone_id: "{{fields.zoneId}}", callback_url: "{{callbackUrl}}" },
        map: { orderId: "id", status: "status", message: "message", codes: "codes" },
        statusMap: { completed: "SUCCESS", success: "SUCCESS", pending: "PENDING", processing: "PENDING", failed: "FAILED", rejected: "FAILED" },
      },
      status: {
        method: "GET",
        path: "/orders/{{ref}}",
        headers: { "X-Api-Key": "{{secret.apiKey}}" },
        map: { orderId: "id", status: "status", message: "message", codes: "codes" },
        statusMap: { completed: "SUCCESS", success: "SUCCESS", pending: "PENDING", processing: "PENDING", failed: "FAILED", rejected: "FAILED" },
      },
      balance: { method: "GET", path: "/balance", headers: { "X-Api-Key": "{{secret.apiKey}}" }, map: { balance: "balance", currency: "currency" } },
      callbackReply: '{"status":"ok"}',
    },
  },

  moogold: {
    label: "MooGold (game top-ups, vouchers)",
    baseUrl: "https://moogold.com/wp-json/v1/api",
    skuHelp: "MooGold product (variation) id",
    config: {
      secrets: ["partnerId", "secretKey"],
      notes: "Signed requests: auth = HMAC-SHA256(secret, body + timestamp + path). Check field names in MooGold's docs.",
      order: {
        method: "POST",
        path: "order/create_order",
        headers: { Authorization: basic("partnerId", "secretKey"), timestamp: "{{timestamp}}", auth: "{{body | append:timestamp | append:path | hmac_sha256:secret.secretKey}}" },
        body: { path: "order/create_order", data: { category: "#1", "product-id": "{{sku}}", quantity: "#{{quantity}}", "User ID": "{{fields.playerId}}", Server: "{{fields.zoneId}}" }, partnerOrderId: "{{ref}}" },
        map: { orderId: "account_details.order_id", status: "status", message: "message", codes: "item[*].voucher_code[*]" },
        statusMap: { completed: "SUCCESS", processing: "PENDING", pending: "PENDING", "incorrect-details": "FAILED", refunded: "FAILED", failed: "FAILED" },
      },
      status: {
        method: "POST",
        path: "order/order_detail_partner_id",
        headers: { Authorization: basic("partnerId", "secretKey"), timestamp: "{{timestamp}}", auth: "{{body | append:timestamp | append:path | hmac_sha256:secret.secretKey}}" },
        body: { path: "order/order_detail_partner_id", partner_order_id: "{{ref}}" },
        map: { orderId: "order_id", status: "order_status", message: "message", codes: "item[*].voucher_code[*]" },
        statusMap: { completed: "SUCCESS", processing: "PENDING", pending: "PENDING", "incorrect-details": "FAILED", refunded: "FAILED", failed: "FAILED" },
      },
      balance: {
        method: "POST",
        path: "user/balance",
        headers: { Authorization: basic("partnerId", "secretKey"), timestamp: "{{timestamp}}", auth: "{{body | append:timestamp | append:path | hmac_sha256:secret.secretKey}}" },
        body: { path: "user/balance" },
        map: { balance: "balance", currency: "currency" },
      },
      callbackReply: '{"status":"success"}',
    },
  },

  reloadly_giftcards: {
    label: "Reloadly (gift cards)",
    baseUrl: "https://giftcards.reloadly.com",
    skuHelp: "productId:unitPrice, e.g. 18:25",
    config: {
      secrets: ["clientId", "clientSecret"],
      notes: "For the test environment use https://giftcards-sandbox.reloadly.com and audience https://giftcards-sandbox.reloadly.com.",
      token: {
        method: "POST",
        path: "https://auth.reloadly.com/oauth/token",
        body: { client_id: "{{secret.clientId}}", client_secret: "{{secret.clientSecret}}", grant_type: "client_credentials", audience: "https://giftcards.reloadly.com" },
        map: { token: "access_token", expiresIn: "expires_in" },
      },
      order: {
        method: "POST",
        path: "/orders",
        headers: { Authorization: "Bearer {{token}}", Accept: "application/com.reloadly.giftcards-v1+json" },
        body: { productId: "#{{skuParts.0}}", unitPrice: "#{{skuParts.1}}", quantity: "#{{quantity}}", customIdentifier: "{{ref}}", senderName: "HaitiViral", recipientEmail: "{{email}}" },
        map: { orderId: "transactionId", status: "status", message: "message" },
        statusMap: { successful: "SUCCESS", pending: "PENDING", processing: "PENDING", failed: "FAILED", refunded: "FAILED" },
      },
      status: {
        method: "GET",
        path: "/reports/transactions/{{supplierOrderId}}",
        headers: { Authorization: "Bearer {{token}}", Accept: "application/com.reloadly.giftcards-v1+json" },
        map: { orderId: "transactionId", status: "status", message: "message" },
        statusMap: { successful: "SUCCESS", pending: "PENDING", processing: "PENDING", failed: "FAILED", refunded: "FAILED" },
      },
      codes: {
        method: "GET",
        path: "/orders/transactions/{{supplierOrderId}}/cards",
        headers: { Authorization: "Bearer {{token}}", Accept: "application/com.reloadly.giftcards-v1+json" },
        map: { codes: "[*]", code: "cardNumber", pin: "pinCode" },
      },
      balance: {
        method: "GET",
        path: "/accounts/balance",
        headers: { Authorization: "Bearer {{token}}", Accept: "application/com.reloadly.giftcards-v1+json" },
        map: { balance: "balance", currency: "currencyCode" },
      },
    },
  },

  dtone: {
    label: "DT One DVS (airtime, PINs)",
    baseUrl: "https://dvs-api.dtone.com/v1",
    skuHelp: "DT One product id",
    config: {
      secrets: ["apiKey", "apiSecret"],
      notes: "Pre-production: https://preprod-dvs-api.dtone.com/v1",
      order: {
        method: "POST",
        path: "/async/transactions",
        headers: { Authorization: basic("apiKey", "apiSecret") },
        body: { external_id: "{{ref}}", product_id: "#{{sku}}", auto_confirm: "?true", credit_party_identifier: { mobile_number: "{{fields.phone}}" }, callback_url: "{{callbackUrl}}" },
        map: { orderId: "id", status: "status.class.message", message: "status.message", codes: "pin", code: "code", serial: "serial" },
        statusMap: { completed: "SUCCESS", created: "PENDING", confirmed: "PENDING", submitted: "PENDING", rejected: "FAILED", cancelled: "FAILED", declined: "FAILED" },
      },
      status: {
        method: "GET",
        path: "/transactions/{{supplierOrderId}}",
        headers: { Authorization: basic("apiKey", "apiSecret") },
        map: { orderId: "id", status: "status.class.message", message: "status.message", codes: "pin", code: "code", serial: "serial" },
        statusMap: { completed: "SUCCESS", created: "PENDING", confirmed: "PENDING", submitted: "PENDING", rejected: "FAILED", cancelled: "FAILED", declined: "FAILED" },
      },
      balance: { method: "GET", path: "/balances", headers: { Authorization: basic("apiKey", "apiSecret") }, map: { balance: "[0].available", currency: "[0].unit" } },
    },
  },

  bamboo: {
    label: "Bamboo Card (gift cards)",
    baseUrl: "https://api.bamboocardportal.com/api/integration/v1.0",
    skuHelp: "productId:faceValue, e.g. 1234:25",
    config: {
      secrets: ["clientId", "clientSecret", "accountId"],
      order: {
        method: "POST",
        path: "/orders/checkout",
        headers: { Authorization: basic("clientId", "clientSecret") },
        body: { RequestId: "{{ref}}", AccountId: "#{{secret.accountId}}", Products: [{ ProductId: "#{{skuParts.0}}", Quantity: "#{{quantity}}", Value: "#{{skuParts.1}}" }] },
        okOutcome: "PENDING",
      },
      status: {
        method: "GET",
        path: "/orders/{{ref}}",
        headers: { Authorization: basic("clientId", "clientSecret") },
        map: { status: "status", codes: "items[*].cards[*]", code: "cardCode", pin: "pin", serial: "serialNumber", expiry: "expirationDate" },
        statusMap: { succeeded: "SUCCESS", created: "PENDING", processing: "PENDING", pending: "PENDING", failed: "FAILED", partialfailed: "FAILED" },
      },
      balance: { method: "GET", path: "/accounts", headers: { Authorization: basic("clientId", "clientSecret") }, map: { balance: "accounts[0].balance", currency: "accounts[0].currency" } },
    },
  },

  digiflazz: {
    label: "Digiflazz (top-ups)",
    baseUrl: "https://api.digiflazz.com/v1",
    skuHelp: "buyer_sku_code",
    config: {
      secrets: ["username", "apiKey"],
      notes: "Sending the same ref_id again returns its status, so the status check reuses the order request.",
      order: {
        method: "POST",
        path: "/transaction",
        body: { username: "{{secret.username}}", buyer_sku_code: "{{sku}}", customer_no: "{{fields.playerId}}{{fields.zoneId}}", ref_id: "{{ref}}", sign: "{{secret.username | append:secret.apiKey | append:ref | md5}}" },
        map: { status: "data.status", message: "data.message", orderId: "data.ref_id" },
        statusMap: { sukses: "SUCCESS", pending: "PENDING", gagal: "FAILED" },
      },
      status: {
        method: "POST",
        path: "/transaction",
        body: { username: "{{secret.username}}", buyer_sku_code: "{{sku}}", customer_no: "{{fields.playerId}}{{fields.zoneId}}", ref_id: "{{ref}}", sign: "{{secret.username | append:secret.apiKey | append:ref | md5}}" },
        map: { status: "data.status", message: "data.message", orderId: "data.ref_id" },
        statusMap: { sukses: "SUCCESS", pending: "PENDING", gagal: "FAILED" },
      },
      balance: {
        method: "POST",
        path: "/cek-saldo",
        body: { cmd: "deposit", username: "{{secret.username}}", sign: "{{secret.username | append:secret.apiKey | append:'depo' | md5}}" },
        map: { balance: "data.deposit" },
      },
    },
  },

  smm_panel: {
    label: "SMM panel (standard API v2): paste the API address and your key",
    baseUrl: "https://panel.example/api/v2",
    skuHelp: "Service id",
    config: {
      secrets: ["apiKey"],
      notes: "These panels have no order reference of ours: an order that timed out can't be checked and goes to staff.",
      order: {
        method: "POST",
        path: "",
        encoding: "form",
        body: { key: "{{secret.apiKey}}", action: "add", service: "{{sku}}", link: "{{fields.link}}", quantity: "{{quantity}}" },
        map: { orderId: "order", message: "error" },
        errorPath: "error",
        okOutcome: "PENDING",
      },
      status: {
        method: "POST",
        path: "",
        encoding: "form",
        body: { key: "{{secret.apiKey}}", action: "status", order: "{{supplierOrderId}}" },
        map: { status: "status", message: "error" },
        statusMap: { completed: "SUCCESS", pending: "PENDING", "in progress": "PENDING", processing: "PENDING", canceled: "FAILED", partial: "FAILED" },
      },
      balance: { method: "POST", path: "", encoding: "form", body: { key: "{{secret.apiKey}}", action: "balance" }, map: { balance: "balance", currency: "currency" } },
    },
  },

  ytseller: {
    label: "YTSeller (accounts + SMS numbers)",
    baseUrl: "https://ytseller.com/api/v2",
    skuHelp: "YTSeller product id (from Sync / products)",
    config: {
      secrets: ["apiKey"],
      notes: "Accounts and SMS verification numbers. Orders use trans_id = our reference so a resend never buys twice. Delivered login/SMS lines are stored encrypted. Sync the product catalog from Admin → Services (or this supplier).",
      order: {
        method: "POST",
        path: "",
        encoding: "form",
        body: { key: "{{secret.apiKey}}", action: "add_product_order", product_id: "{{sku}}", quantity: "{{quantity}}", trans_id: "{{ref}}" },
        map: { orderId: "order", message: "error" },
        errorPath: "error",
        okOutcome: "PENDING",
      },
      status: {
        method: "POST",
        path: "",
        encoding: "form",
        body: { key: "{{secret.apiKey}}", action: "product_order_status", order: "{{supplierOrderId}}" },
        map: { status: "status", message: "error" },
        statusMap: { completed: "SUCCESS", pending: "PENDING", processing: "PENDING", "in progress": "PENDING", canceled: "FAILED", cancelled: "FAILED", partial: "PENDING" },
      },
      codes: {
        method: "POST",
        path: "",
        encoding: "form",
        body: { key: "{{secret.apiKey}}", action: "result_product", order: "{{supplierOrderId}}" },
        map: { codes: "result" },
      },
      balance: { method: "POST", path: "", encoding: "form", body: { key: "{{secret.apiKey}}", action: "balance" }, map: { balance: "balance", currency: "currency" } },
    },
  },

  smm_mock: {
    label: "Test SMM panel (fake, for trying the setup; key: mock-key)",
    baseUrl: "/api/suppliers/mock-smm",
    skuHelp: "Service id (101-109, 199)",
    config: {
      secrets: ["apiKey"],
      notes: "Fake SMM panel built into the site for tests. API key: mock-key. 104 ends Partial, 105 ends Canceled, 199 is refused.",
      order: { method: "POST", path: "", encoding: "form", body: {} },
    },
  },

  mock: {
    label: "Test supplier (fake, for trying the setup)",
    baseUrl: "/api/suppliers/mock",
    skuHelp: "OK-CODE, OK-TOPUP, PENDING, FAIL, TIMEOUT or ERROR",
    config: {
      secrets: ["apiKey"],
      notes: "Fake supplier built into the site for tests. API key: mock-key. Works only where test payments are allowed.",
      timeoutMs: 1500,
      order: {
        method: "POST",
        path: "/order",
        headers: { "X-Api-Key": "{{secret.apiKey}}" },
        body: { ref: "{{ref}}", sku: "{{sku}}", quantity: "#{{quantity}}", player: "{{fields.playerId}}" },
        map: { orderId: "order_id", status: "status", message: "message", codes: "codes" },
        statusMap: { completed: "SUCCESS", processing: "PENDING", failed: "FAILED" },
      },
      status: {
        method: "POST",
        path: "/status",
        headers: { "X-Api-Key": "{{secret.apiKey}}" },
        body: { ref: "{{ref}}", sku: "{{sku}}", quantity: "#{{quantity}}" },
        map: { orderId: "order_id", status: "status", message: "message", codes: "codes" },
        statusMap: { completed: "SUCCESS", processing: "PENDING", failed: "FAILED" },
      },
      balance: { method: "GET", path: "/balance", headers: { "X-Api-Key": "{{secret.apiKey}}" }, map: { balance: "balance", currency: "currency" } },
      callbackReply: '{"status":"ok"}',
    },
  },
};
