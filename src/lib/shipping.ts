export interface ShippingPolicy {
  flat_rate: number;
  free_shipping_threshold: number;
}

// Display only. place_order calculates the authoritative amount from DB prices.
export function shippingAmount(subtotal: number, discount: number, policy: ShippingPolicy) {
  const merchandiseCents = Math.max(Math.round(subtotal * 100) - Math.round(discount * 100), 0);
  return merchandiseCents >= Math.round(policy.free_shipping_threshold * 100) ? 0 : policy.flat_rate;
}

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);

export function shippingDescription(policy: ShippingPolicy) {
  return `${formatCurrency(policy.flat_rate)} shipping. Free shipping on orders of ${formatCurrency(policy.free_shipping_threshold)} or more after discounts.`;
}
