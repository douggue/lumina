/** Price after the VIP discount (also used in the browser, so kept apart from the database code). At least 1 gourde. */
export function withDiscount(price: number, discountPct: number) {
  return discountPct > 0 ? Math.max(100, Math.round((price * (100 - discountPct)) / 100)) : price;
}
