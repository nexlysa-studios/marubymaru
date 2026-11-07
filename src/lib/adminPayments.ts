export const paymentStatuses = ["paid", "pending", "failed", "cancelled", "unknown"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const paymentStatusDetails: Record<PaymentStatus, { label: string; description: string }> = {
  paid: { label: "Paid", description: "PayFast has confirmed successful payment. Fulfilment and email delivery are tracked separately." },
  pending: { label: "Pending", description: "No verified payment confirmation has been received. This can include abandoned or cancelled checkouts when PayFast has not sent a notification." },
  failed: { label: "Failed", description: "PayFast reported an unsuccessful payment. Payment must be confirmed before dispatching this order." },
  cancelled: { label: "Cancelled", description: "PayFast reported a cancelled payment. This is separate from cancelling an order's fulfilment." },
  unknown: { label: "Unknown", description: "This payment status could not be recognised. Refresh and check the PayFast record before dispatching." },
};

export function paymentStatus(value: string | null | undefined): PaymentStatus {
  return paymentStatuses.includes(value as PaymentStatus) ? value as PaymentStatus : "unknown";
}

export function paymentSummary(orders: ReadonlyArray<{ payment_status: string; total: number }>) {
  const counts: Record<PaymentStatus, number> = { paid: 0, pending: 0, failed: 0, cancelled: 0, unknown: 0 };
  let paidCents = 0;
  let pendingCents = 0;
  for (const order of orders) {
    const status = paymentStatus(order.payment_status);
    counts[status] += 1;
    const cents = Number.isFinite(order.total) ? Math.round(order.total * 100) : 0;
    if (status === "paid") paidCents += cents;
    if (status === "pending") pendingCents += cents;
  }
  // These are gross order totals (including delivery), not PayFast payouts or refunds.
  return { counts, paidTotal: paidCents / 100, pendingTotal: pendingCents / 100 };
}
