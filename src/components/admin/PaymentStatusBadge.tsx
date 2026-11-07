import { Check, CircleAlert, Clock3, X } from "lucide-react";
import { paymentStatus, paymentStatusDetails } from "@/lib/adminPayments";

const styles = {
  paid: { Icon: Check, className: "border-emerald-800/20 bg-emerald-50/70 text-emerald-900" },
  pending: { Icon: Clock3, className: "border-amber-800/20 bg-amber-50/70 text-amber-900" },
  failed: { Icon: CircleAlert, className: "border-rose-800/20 bg-rose-50/70 text-rose-900" },
  cancelled: { Icon: X, className: "border-black/15 bg-black/[0.025] text-black/60" },
  unknown: { Icon: CircleAlert, className: "border-black/15 bg-black/[0.025] text-black/60" },
};

export default function PaymentStatusBadge({ status }: { status: string | null | undefined }) {
  const state = paymentStatus(status);
  const { Icon, className } = styles[state];
  return <span aria-label={`Payment: ${paymentStatusDetails[state].label}`} className={`inline-flex w-fit max-w-full items-center gap-1.5 border px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] ${className}`}>
    <Icon size={12} strokeWidth={1.5} aria-hidden="true" />
    {paymentStatusDetails[state].label}
  </span>;
}
