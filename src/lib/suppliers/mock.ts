/** The built-in fake supplier only answers on test setups (never on the live site). */
export function mockSupplierAllowed() {
  return process.env.VERCEL_ENV !== "production" && (process.env.NODE_ENV !== "production" || process.env.ALLOW_MOCK_PAYMENTS === "1");
}
