import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check, CircleAlert, Loader2, LockKeyhole } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/shipping";
import { redirectToPayFast } from "@/lib/payfastRedirect";

interface RecoveryOrder { order_id: string; order_number: string; total: number; payment_status: string; can_pay: boolean; checkout?: unknown }
const isRecoveryOrder = (value: unknown): value is RecoveryOrder => {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return typeof data.order_id === "string" && typeof data.order_number === "string" && typeof data.total === "number" && Number.isFinite(data.total) && typeof data.payment_status === "string" && typeof data.can_pay === "boolean";
};
export default function PaymentRecovery() {
  const [params] = useSearchParams();
  const token = params.get("token"), cancelling = params.get("mode") === "cancel";
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token ?? "");
  const [order, setOrder] = useState<RecoveryOrder | null>(null);
  const [loading, setLoading] = useState(valid), [busy, setBusy] = useState(false), [redirecting, setRedirecting] = useState(false), [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const submitting = useRef(false);
  const statusHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const meta = document.createElement("meta"); meta.name = "referrer"; meta.content = "no-referrer"; document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  useEffect(() => {
    setOrder(null); setError(""); setLoading(valid);
    if (!valid) { setError("This payment link is invalid. Please use the link in your reminder email or contact Maru."); return; }
    const controller = new AbortController(); let disposed = false;
    void supabase.functions.invoke("payment-recovery", { body: { action: "status", token }, signal: controller.signal, timeout: 10000 }).then(({ data, error }) => {
      if (disposed) return;
      if (error || data?.error || !isRecoveryOrder(data)) setError(data?.error || "We couldn't check this order. Please refresh its status before paying.");
      else setOrder(data);
      setLoading(false);
    }).catch(() => { if (!disposed) { setError("We couldn't check this order. Please try again."); setLoading(false); } });
    return () => { disposed = true; controller.abort(); };
  }, [token, valid, retry]);
  useEffect(() => { if (redirecting) { window.scrollTo({ top: 0, left: 0, behavior: "instant" }); statusHeading.current?.focus({ preventScroll: true }); } }, [redirecting]);
  const act = async (action: "start" | "cancel") => {
    if (!valid || submitting.current || !order?.can_pay) return;
    submitting.current = true; setBusy(true); setError("");
    if (action === "start") setRedirecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("payment-recovery", { body: { action, token }, timeout: 15000 });
      if (error || data?.error || !isRecoveryOrder(data)) throw new Error(data?.error || "We couldn't update your payment. Please check its status and try again.");
      setOrder(data);
      if (action === "start" && data.payment_status === "pending" && data.can_pay && data.checkout) { redirectToPayFast(data.checkout); return; }
      if (action === "start" && data.payment_status === "pending") throw new Error("PayFast is temporarily unavailable. Please try again.");
      setRedirecting(false);
    } catch (caught) { setRedirecting(false); setError(caught instanceof Error ? caught.message : "Payment is temporarily unavailable."); }
    finally { submitting.current = false; setBusy(false); }
  };
  const paid = order?.payment_status === "paid", cancelled = order?.payment_status === "cancelled";
  return <div className="mx-auto flex min-h-[70vh] max-w-xl items-center px-6 py-16 text-center sm:py-24"><div className="w-full">
    <div aria-hidden="true" className="mx-auto mb-8 flex h-14 w-14 items-center justify-center border border-black/15">{loading || redirecting ? <Loader2 size={22} strokeWidth={1} className="motion-safe:animate-spin" /> : paid ? <Check size={24} strokeWidth={1} /> : cancelled || error ? <CircleAlert size={24} strokeWidth={1} /> : <LockKeyhole size={23} strokeWidth={1} />}</div>
    <p className="text-[10px] uppercase tracking-[0.25em] text-black/45">Your Maru order</p>
    <div role="status" aria-live="polite"><h1 ref={statusHeading} tabIndex={-1} className="mt-4 font-serif text-4xl leading-tight outline-none sm:text-5xl">{redirecting ? "Redirecting you to PayFast…" : loading ? "Checking your payment." : paid ? "Your payment is confirmed." : cancelled ? "Your order is cancelled." : cancelling ? "Cancel this unpaid order?" : "Complete your order."}</h1></div>
    {order && !redirecting && <><p className="mt-6 break-words text-sm leading-7 text-black/60">Order <strong className="font-medium text-black">{order.order_number}</strong></p><p className="mt-3 font-serif text-3xl">{formatCurrency(order.total)}</p></>}
    {redirecting ? <p className="mt-6 text-sm leading-7 text-black/55">Please keep this page open while we take you to PayFast. Don't refresh or pay a second time.</p> : paid ? <p className="mt-6 text-sm leading-7 text-black/55">PayFast has confirmed your payment. You do not need to pay again. Your order confirmation emails follow the normal process.</p> : cancelled ? <p className="mt-6 text-sm leading-7 text-black/55">This unpaid order has been cancelled. If you already completed payment in another window, please contact Maru so we can check PayFast's confirmation.</p> : order && !loading && <p className="mt-6 text-sm leading-7 text-black/55">{cancelling ? "You can keep your order and complete payment, or confirm cancellation below. Opening this page does not cancel anything." : "Continue with your existing order and its saved total. You won't create a second order."}</p>}
    {error && <p role="alert" className="mt-6 border border-black/15 p-4 text-sm leading-7">{error}</p>}
    {!loading && !redirecting && order?.can_pay && !paid && !cancelled && <div className="mt-8 flex flex-col gap-3">
      <button type="button" onClick={() => void act("start")} disabled={busy} className="min-h-12 bg-black px-6 text-[10px] uppercase tracking-[0.2em] text-white disabled:opacity-40">{busy ? "Please wait…" : cancelling ? "Keep order & pay with PayFast" : "Pay now with PayFast"}</button>
      {cancelling ? <button type="button" onClick={() => void act("cancel")} disabled={busy} className="min-h-12 border border-black/20 px-6 text-[10px] uppercase tracking-[0.2em] disabled:opacity-40">Yes, cancel this order</button> : <Link to={`/payment/reminder?token=${encodeURIComponent(token!)}&mode=cancel`} className="inline-flex min-h-11 items-center justify-center text-xs underline underline-offset-4">Cancel this unpaid order</Link>}
      <p className="mt-2 text-xs leading-6 text-black/50">Already paid? Please don't pay again. Check the latest status or contact us first.</p>
    </div>}
    {!redirecting && valid && <button type="button" disabled={loading || busy} onClick={() => setRetry(n => n + 1)} className="mt-6 min-h-11 px-3 text-[10px] uppercase tracking-wider underline underline-offset-4 disabled:opacity-40">Check payment status</button>}
    {!redirecting && <div className="mt-7 flex flex-wrap justify-center gap-6 text-xs underline underline-offset-4">{paid && order && <Link to={`/payment/success?order=${order.order_id}`} className="py-3">View confirmation</Link>}<Link to="/shop" className="py-3">Return to shop</Link><Link to="/contact" className="py-3">Contact Maru</Link></div>}
  </div></div>;
}
