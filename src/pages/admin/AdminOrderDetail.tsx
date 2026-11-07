import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, ImageOff, Loader2, Mail, MapPin, Phone, RefreshCw, Save } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminOrdersQueryKey, useAdminOrder } from "@/hooks/useAdminOrders";
import { supabase } from "@/integrations/supabase/client";
import OrderEmailStatus from "@/components/admin/OrderEmailStatus";
import PaymentStatusBadge from "@/components/admin/PaymentStatusBadge";
import { paymentStatus, paymentStatusDetails } from "@/lib/adminPayments";

const orderStatuses = ["new", "confirmed", "processing", "shipped", "completed", "cancelled"] as const;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value)) + " SAST";

const AdminOrderDetail = () => {
  const { id } = useParams();
  const { data, isLoading, error, isFetching, refetch, dataUpdatedAt } = useAdminOrder(id);
  const queryClient = useQueryClient();
  const [statusDraft, setStatusDraft] = useState<string | null>(null);
  const [adminNotesDraft, setAdminNotesDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const status = statusDraft ?? data?.order.status ?? "";
  const adminNotes = adminNotesDraft ?? data?.order.admin_notes ?? "";

  useEffect(() => {
    setStatusDraft(null);
    setAdminNotesDraft(null);
  }, [id]);

  const saveOrder = async () => {
    if (!id || !status) return;
    setIsSaving(true);
    try {
      const { error: updateError } = await supabase
        .from("orders")
        .update({ status, admin_notes: adminNotes.trim() })
        .eq("id", id);
      if (updateError) throw updateError;
      await queryClient.invalidateQueries({ queryKey: adminOrdersQueryKey });
      setStatusDraft(null);
      setAdminNotesDraft(null);
      toast.success("Order updated");
    } catch (caught) {
      toast.error("Order could not be updated", { description: caught instanceof Error ? caught.message : "Please try again." });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-xs uppercase tracking-[0.2em]">
        <Loader2 size={17} className="animate-spin" /> Loading order
      </div>
    );
  }

  if (!data) {
    return (
      <div className="px-6 py-24 text-center">
        <h1 className="font-serif text-4xl">Order not found</h1>
        <p className="mt-3 text-sm text-black/45">{error?.message}</p>
        <Link to="/admin/orders" className="mt-8 inline-block border-b border-black pb-1 text-xs uppercase tracking-[0.2em]">Back to orders</Link>
      </div>
    );
  }

  const { order, items } = data;

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="flex flex-col gap-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link to="/admin/orders" className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-black/50 hover:text-black">
            <ArrowLeft size={14} /> Orders
          </Link>
          <h1 className="mt-5 break-words font-serif text-4xl sm:text-5xl">{order.order_number}</h1>
          <p className="mt-2 text-xs text-black/45">Placed {formatDate(order.created_at)}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <PaymentStatusBadge status={order.payment_status} />
            <span className="text-[10px] uppercase tracking-[0.14em] text-black/50">Fulfilment: {order.status}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void saveOrder()}
          disabled={isSaving}
          className="flex items-center justify-center gap-3 bg-black px-6 py-4 text-xs uppercase tracking-[0.2em] text-white disabled:opacity-40"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {isSaving ? "Saving" : "Save changes"}
        </button>
      </div>

      {error && <p role="alert" className="mt-6 border border-black/20 bg-white p-4 text-xs leading-6">The latest order update could not be loaded. The information below may be out of date; refresh the payment status to try again.</p>}

      <div className="mt-10 grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <section className="border border-black/10 bg-white p-6">
            <div className="flex flex-col gap-5 border-b border-black/10 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-serif text-3xl">Items</h2>
              <span className="text-[10px] uppercase tracking-[0.2em] text-black/45">{items.length} line {items.length === 1 ? "item" : "items"}</span>
            </div>
            <div className="divide-y divide-black/10">
              {items.map((item) => (
                <div key={item.id} className="flex gap-5 py-6">
                  <div className="flex h-28 w-20 flex-none items-center justify-center overflow-hidden bg-black/5">
                    {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImageOff size={18} className="text-black/25" />}
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col justify-between sm:flex-row sm:items-center">
                    <div>
                      <p className="break-words font-serif text-xl">{item.product_name}</p>
                      <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-black/45">Size {item.size} · Qty {item.quantity}</p>
                      <p className="mt-2 text-xs text-black/45">{formatCurrency(item.unit_price)} each</p>
                    </div>
                    <p className="mt-3 text-sm sm:mt-0">{formatCurrency(item.line_total)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="ml-auto mt-2 max-w-xs space-y-3 border-t border-black pt-5 text-sm">
              <div className="flex justify-between"><span className="text-black/50">Subtotal</span><span>{formatCurrency(order.subtotal)}</span></div>
              {Number(order.discount_amount) > 0 && (
                <div className="flex justify-between"><span className="text-black/50">Discount ({order.discount_code})</span><span>−{formatCurrency(Number(order.discount_amount))}</span></div>
              )}
              <div className="flex justify-between"><span className="text-black/50">Shipping</span><span>{formatCurrency(order.shipping_amount)}</span></div>
              <div className="flex justify-between pt-2 font-serif text-2xl"><span>Total</span><span>{formatCurrency(order.total)}</span></div>
            </div>
          </section>

          <section className="border border-black/10 bg-white p-6">
            <h2 className="font-serif text-3xl">Order management</h2>
            <div className="mt-7 grid gap-6 sm:grid-cols-2">
              <label className="text-[10px] uppercase tracking-[0.2em]">
                Fulfilment status
                <select value={status} onChange={(event) => setStatusDraft(event.target.value)} disabled={isSaving} className="mt-2 w-full border border-black/20 bg-white px-4 py-3 text-sm outline-none focus:border-black disabled:opacity-50">
                  {orderStatuses.map((option) => <option key={option} value={option}>{option.charAt(0).toUpperCase() + option.slice(1)}</option>)}
                </select>
              </label>
              <label className="text-[10px] uppercase tracking-[0.2em] sm:col-span-2">
                Private admin notes
                <textarea value={adminNotes} onChange={(event) => setAdminNotesDraft(event.target.value)} disabled={isSaving} rows={4} className="mt-2 w-full resize-y border border-black/20 bg-white px-4 py-3 text-sm normal-case tracking-normal outline-none focus:border-black disabled:opacity-50" placeholder="Add fulfilment notes, tracking details, or customer follow-up…" />
              </label>
            </div>
          </section>
        </div>

        <aside className="space-y-8">
          <section aria-label="Payment details" className="border border-black/10 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-serif text-3xl">Payment status</h2>
              <button type="button" onClick={() => void refetch()} disabled={isFetching} aria-label="Refresh payment status" className="flex h-11 w-11 shrink-0 items-center justify-center border border-black/15 hover:bg-black/5 disabled:opacity-40">
                <RefreshCw size={14} aria-hidden="true" className={isFetching ? "motion-safe:animate-spin" : ""} />
              </button>
            </div>
            <div className="mt-5" role="status" aria-live="polite"><PaymentStatusBadge status={order.payment_status} /></div>
            <p className="mt-4 text-xs leading-6 text-black/55">{paymentStatusDetails[paymentStatus(order.payment_status)].description}</p>
            <dl className="mt-5 space-y-4 border-t border-black/10 pt-5 text-xs">
              <div className="flex justify-between gap-4"><dt className="text-black/45">Provider</dt><dd>PayFast</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-black/45">Order amount</dt><dd>{formatCurrency(order.total)}</dd></div>
              <div><dt className="text-black/45">PayFast reference</dt><dd className="mt-1 break-all leading-6">{order.payment_reference || "Not received"}</dd></div>
              <div><dt className="text-black/45">Payment received</dt><dd className="mt-1 leading-6">{order.payment_status === "paid" ? order.paid_at ? formatDate(order.paid_at) : "Date not recorded" : "Not confirmed"}</dd></div>
            </dl>
            <p className="mt-5 border-t border-black/10 pt-4 text-[10px] leading-5 text-black/45">Read-only: only a verified PayFast notification can confirm payment. Updates every 30 seconds while this page is open.{dataUpdatedAt ? ` Last checked ${formatDate(new Date(dataUpdatedAt).toISOString())}.` : ""}</p>
          </section>
          <OrderEmailStatus orderId={order.id} paid={order.payment_status === "paid"} />
          <section className="border border-black/10 bg-white p-6">
            <h2 className="font-serif text-3xl">Customer</h2>
            <p className="mt-6 text-sm">{order.customer_first_name} {order.customer_last_name}</p>
            <a href={`mailto:${order.customer_email}`} className="mt-4 flex min-w-0 items-center gap-3 text-xs text-black/60 hover:text-black"><Mail size={15} className="shrink-0" /><span className="min-w-0 break-all">{order.customer_email}</span></a>
            <a href={`tel:${order.customer_phone}`} className="mt-4 flex items-center gap-3 text-xs text-black/60 hover:text-black"><Phone size={15} /> {order.customer_phone}</a>
          </section>

          <section className="border border-black/10 bg-white p-6">
            <h2 className="font-serif text-3xl">Delivery</h2>
            <div className="mt-6 flex gap-3 text-sm leading-relaxed text-black/65">
              <MapPin size={16} className="mt-1 flex-none" />
              <address className="min-w-0 break-words not-italic">
                {order.shipping_address_line_1}<br />
                {order.shipping_address_line_2 && <>{order.shipping_address_line_2}<br /></>}
                {order.shipping_city}, {order.shipping_province}<br />
                {order.shipping_postal_code}<br />
                {order.shipping_country}
              </address>
            </div>
          </section>

          {order.customer_notes && (
            <section className="border border-black/10 bg-white p-6">
              <h2 className="font-serif text-3xl">Customer notes</h2>
              <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-black/60">{order.customer_notes}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};

export default AdminOrderDetail;

