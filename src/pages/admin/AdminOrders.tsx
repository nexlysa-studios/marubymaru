import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, Loader2, RefreshCw, Search } from "lucide-react";
import { useAdminOrders } from "@/hooks/useAdminOrders";
import PaymentStatusBadge from "@/components/admin/PaymentStatusBadge";
import { paymentStatus, paymentStatuses, paymentStatusDetails, paymentSummary } from "@/lib/adminPayments";

const statuses = ["all", "new", "confirmed", "processing", "shipped", "completed", "cancelled"] as const;

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));

const AdminOrders = () => {
  const { data: orders = [], isLoading, error, isFetching, refetch, dataUpdatedAt } = useAdminOrders();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof statuses)[number]>("all");
  const [params, setParams] = useSearchParams();
  const selectedPayment = params.get("payment");
  const paymentFilter = paymentStatuses.includes(selectedPayment as (typeof paymentStatuses)[number]) ? selectedPayment : "all";
  const payments = useMemo(() => paymentSummary(orders), [orders]);

  const filteredOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesStatus = status === "all" || order.status === status;
      const matchesPayment = paymentFilter === "all" || paymentStatus(order.payment_status) === paymentFilter;
      const matchesQuery =
        !normalized ||
        order.order_number.toLowerCase().includes(normalized) ||
        order.customer_email.toLowerCase().includes(normalized) ||
        order.payment_reference?.toLowerCase().includes(normalized) ||
        `${order.customer_first_name} ${order.customer_last_name}`.toLowerCase().includes(normalized);
      return matchesStatus && matchesPayment && matchesQuery;
    });
  }, [orders, query, status, paymentFilter]);

  const openCount = orders.filter((order) => !["completed", "cancelled"].includes(order.status)).length;
  const newCount = orders.filter((order) => order.status === "new").length;

  return (
    <div className="px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.28em] text-black/45">Sales</p>
          <h1 className="mt-2 font-serif text-5xl lg:text-6xl">Orders</h1>
          <p className="mt-3 text-sm leading-relaxed text-black/50">Track payment and fulfilment separately, from checkout to completion.</p>
        </div>
        <button type="button" onClick={() => void refetch()} disabled={isFetching} className="inline-flex min-h-11 w-fit shrink-0 items-center gap-2 border border-black/20 px-4 text-[10px] uppercase tracking-[0.16em] hover:bg-black/5 disabled:opacity-40">
          <RefreshCw size={14} aria-hidden="true" className={isFetching ? "motion-safe:animate-spin" : ""} /> Refresh orders
        </button>
      </div>

      <div className="mt-10 grid grid-cols-3 border border-black/10 bg-white">
        {[["Total", orders.length], ["Open", openCount], ["New", newCount]].map(([label, value], index) => (
          <div key={label} className={`p-5 sm:p-7 ${index > 0 ? "border-l border-black/10" : ""}`}>
            <p className="text-[9px] uppercase tracking-[0.22em] text-black/45">{label}</p>
            <p className="mt-2 font-serif text-3xl sm:text-4xl">{isLoading || error ? "—" : value}</p>
          </div>
        ))}
      </div>

      {!isLoading && !error && <section aria-label="Payment overview" className="mt-6">
        <h2 className="font-serif text-2xl">Payment overview</h2>
        <p className="mt-2 text-xs leading-6 text-black/50">All orders. Paid totals include shipping and reflect discounts; they are not a payout or refund report.</p>
        <div className="mt-4 grid grid-cols-2 border-l border-t border-black/10 bg-white xl:grid-cols-4">
          {(["paid", "pending", "failed", "cancelled"] as const).map((state) => <Link key={state} to={`?payment=${state}`} aria-label={`View ${paymentStatusDetails[state].label.toLowerCase()} payments`} className="min-w-0 border-b border-r border-black/10 p-4 transition-colors hover:bg-black/[0.025] sm:p-5">
            <PaymentStatusBadge status={state} />
            <p className="mt-3 font-serif text-3xl">{payments.counts[state]}</p>
            <p className="mt-2 break-words text-[10px] leading-5 text-black/50">{state === "paid" ? `${formatCurrency(payments.paidTotal)} confirmed` : state === "pending" ? `${formatCurrency(payments.pendingTotal)} awaiting confirmation` : "Payment notifications from PayFast"}</p>
          </Link>)}
        </div>
        {payments.counts.unknown > 0 && <Link to="?payment=unknown" className="mt-3 inline-flex min-h-11 items-center text-xs underline underline-offset-4">{payments.counts.unknown} {payments.counts.unknown === 1 ? "order" : "orders"} with an unknown payment status — review</Link>}
      </section>}

      <div className="mt-8 flex flex-col gap-5 border-b border-black/15 pb-5">
        <div className="relative max-w-md">
          <Search size={16} className="absolute left-0 top-1/2 -translate-y-1/2 text-black/40" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search order, customer, email or PayFast reference"
            aria-label="Search orders"
            className="w-full border-0 border-b border-black/25 bg-transparent py-3 pl-7 text-sm outline-none focus:border-black"
          />
        </div>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-[9px] uppercase tracking-[0.18em] text-black/45">Fulfilment</p>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by fulfilment">
              {statuses.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                  aria-pressed={status === option}
                  className={`min-h-11 px-3 py-2 text-[9px] uppercase tracking-[0.16em] ${
                    status === option ? "bg-black text-white" : "bg-white text-black/50 hover:text-black"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>
          <label className="text-[9px] uppercase tracking-[0.18em] text-black/45">
            Payment status
            <select value={paymentFilter} onChange={(event) => setParams(current => {
              const next = new URLSearchParams(current);
              if (event.target.value === "all") next.delete("payment"); else next.set("payment", event.target.value);
              return next;
            }, { replace: true })} className="mt-2 block min-h-11 w-full border border-black/20 bg-white px-3 py-2 text-xs normal-case tracking-normal text-black lg:w-48">
              <option value="all">All payment statuses</option>
              {paymentStatuses.map(state => <option key={state} value={state}>{paymentStatusDetails[state].label}</option>)}
            </select>
          </label>
        </div>
        {!isLoading && !error && <p className="text-[10px] leading-5 text-black/45">Showing {filteredOrders.length} of {orders.length} orders. Updates every 30 seconds while this page is open.{dataUpdatedAt ? ` Last checked ${formatDate(new Date(dataUpdatedAt).toISOString())} SAST.` : ""}</p>}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-3 py-24 text-xs uppercase tracking-[0.2em]">
          <Loader2 size={17} className="animate-spin" /> Loading orders
        </div>
      )}

      {error && (
        <div className="my-10 border border-black bg-white p-6 text-sm">
          <p>Orders could not be loaded.</p>
          <p className="mt-2 text-black/50">{error.message}</p>
        </div>
      )}

      {!isLoading && !error && filteredOrders.length === 0 && (
        <div className="py-24 text-center">
          <p className="font-serif text-3xl">No orders found</p>
          <p className="mt-3 text-sm text-black/45">{orders.length ? "Try another payment status, fulfilment filter or search." : "New customer orders will appear here."}</p>
        </div>
      )}

      {!isLoading && !error && filteredOrders.length > 0 && (
        <div>
          <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto] gap-4 border-b border-black/10 py-4 text-[9px] uppercase tracking-[0.16em] text-black/45 lg:grid"><span>Order / placed</span><span>Customer</span><span>Total / fulfilment</span><span>Payment</span><span className="w-[17px]" /></div>
          <div className="divide-y divide-black/10">
          {filteredOrders.map((order) => (
            <Link
              key={order.id}
              to={`/admin/orders/${order.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-6 transition-colors hover:bg-black/[0.025] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_auto]"
            >
              <div className="min-w-0">
                <p className="break-words font-serif text-xl">{order.order_number}</p>
                <p className="mt-1 text-[10px] leading-5 text-black/40">{formatDate(order.created_at)}</p>
                <p className="mt-2 break-words text-xs text-black/55 lg:hidden">{order.customer_first_name} {order.customer_last_name}</p>
              </div>
              <div className="hidden min-w-0 lg:block">
                <p className="break-words text-sm">{order.customer_first_name} {order.customer_last_name}</p>
                <p className="mt-1 break-all text-[10px] text-black/40">{order.customer_email}</p>
              </div>
              <div className="min-w-0 text-right lg:text-left">
                <p className="text-sm">{formatCurrency(order.total)}</p>
                <span aria-label={`Fulfilment: ${order.status}`} className="mt-2 inline-block border border-black/20 px-2 py-1 text-[8px] uppercase tracking-[0.16em]">
                  {order.status}
                </span>
              </div>
              <div className="col-span-2 flex items-center justify-between gap-3 lg:col-span-1 lg:block">
                <span className="text-[9px] uppercase tracking-[0.16em] text-black/45 lg:hidden">Payment</span>
                <PaymentStatusBadge status={order.payment_status} />
              </div>
              <ChevronRight size={17} className="hidden lg:block" aria-hidden="true" />
            </Link>
          ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminOrders;
