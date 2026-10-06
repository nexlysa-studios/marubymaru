import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const labels: Record<string, string> = {
  queued: "Queued", processing: "Sending", sent: "Sent", delivered: "Delivered",
  delayed: "Delivery delayed", bounced: "Bounced", complained: "Marked as spam",
  failed: "Failed", suppressed: "Suppressed", attention: "Needs review",
};
const formatDate = (value: string) => new Intl.DateTimeFormat("en-ZA", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg",
}).format(new Date(value)) + " SAST";

export default function OrderEmailStatus({ orderId, paid }: { orderId: string; paid: boolean }) {
  const { data, error, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin", "order-emails", orderId],
    queryFn: async () => {
      const result = await supabase.from("order_emails")
        .select("id, order_id, kind, status, recipient, provider_id, attempts, last_error, sent_at, delivery_status, delivery_updated_at, created_at")
        .eq("order_id", orderId).order("created_at", { ascending: true });
      if (result.error) throw result.error;
      return result.data;
    },
    refetchInterval: 15000,
  });
  return (
    <section className="border border-black/10 bg-white p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-3xl">Order emails</h2>
        <button type="button" onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh email status"
          className="flex h-10 w-10 shrink-0 items-center justify-center border border-black/15 hover:bg-black/5 disabled:opacity-40">
          <RefreshCw size={14} className={isFetching ? "motion-safe:animate-spin" : ""} />
        </button>
      </div>
      {isLoading ? <p className="mt-5 flex items-center gap-2 text-xs text-black/50"><Loader2 size={14} className="motion-safe:animate-spin" /> Loading email status</p>
        : error ? <p role="alert" className="mt-5 text-xs leading-6 text-black/60">Email status is unavailable. Refresh to try again.</p>
        : !data?.length ? <p className="mt-5 text-xs leading-6 text-black/50">{paid ? "No confirmation emails are recorded for this order. Orders paid before email notifications were enabled are not sent automatically." : "Customer and admin confirmations are queued only after PayFast confirms payment."}</p>
        : <div className="mt-3 divide-y divide-black/10">{data.map((entry) => {
          const status = entry.delivery_status || entry.status;
          const needsAttention = ["failed", "attention", "bounced", "complained", "suppressed"].includes(status);
          return <div key={entry.id} className="py-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.14em]">{entry.kind === "customer_payment" ? "Customer confirmation" : "Admin notification"}</p>
              <span className={`border px-2 py-1 text-[10px] ${needsAttention ? "border-amber-800/25 bg-amber-50 text-amber-900" : "border-black/10 text-black/60"}`}>{labels[status] ?? status}</span>
            </div>
            {entry.recipient && <p className="mt-3 break-all text-xs text-black/55">{entry.recipient}</p>}
            {entry.sent_at && <p className="mt-2 text-[11px] leading-5 text-black/45">Sent {formatDate(entry.sent_at)}</p>}
            {entry.delivery_updated_at && <p className="mt-1 text-[11px] leading-5 text-black/45">Updated {formatDate(entry.delivery_updated_at)}</p>}
            {entry.provider_id && <p className="mt-2 break-all text-[10px] leading-5 text-black/40">Resend ID: {entry.provider_id}</p>}
            {entry.last_error && <p className="mt-3 text-xs leading-6 text-black/60">{entry.last_error}</p>}
            {needsAttention && <p className="mt-2 text-xs leading-6 text-black/60">Review the address and Resend delivery log before sending another email. Payment status is unaffected.</p>}
          </div>;
        })}</div>}
      <p className="mt-3 border-t border-black/10 pt-4 text-[11px] leading-6 text-black/45">Sent means accepted by Resend. Delivered means accepted by the recipient’s mail server—not necessarily read. Email sending normally starts within a minute.</p>
    </section>
  );
}
