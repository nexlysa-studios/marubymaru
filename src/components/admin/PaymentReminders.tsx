import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
const date = (value: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value)) + " SAST";
export default function PaymentReminders() {
  const cache = useQueryClient();
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false);
  const settings = useQuery({ queryKey: ["admin", "payment-reminder-settings"], queryFn: async () => {
    const { data, error } = await supabase.from("payment_reminder_settings").select("enabled,enabled_from").eq("id", true).single(); if (error) throw error; return data;
  } });
  const history = useQuery({ queryKey: ["admin", "payment-reminders"], enabled: open, queryFn: async () => {
    const { data, error } = await supabase.from("payment_reminders").select("id,order_id,status,recipient,last_error,sent_at,delivery_status,created_at").order("created_at", { ascending: false }).limit(15); if (error) throw error; return data;
  }, refetchInterval: 30000 });
  const toggle = async () => {
    if (!settings.data || busy) return;
    const enabled = !settings.data.enabled;
    if (enabled && !window.confirm("Have you published /payment/reminder on the live website? Enable one-time reminders for NEW orders left unpaid for 15 minutes? Old orders will not be backfilled.")) return;
    setBusy(true);
    try { const { error } = await supabase.rpc("configure_payment_reminders", { p_enabled: enabled }); if (error) throw error; await cache.invalidateQueries({ queryKey: ["admin", "payment-reminder-settings"] }); toast.success(enabled ? "Payment reminders enabled for new orders" : "Payment reminders paused"); }
    catch { toast.error("Payment reminder settings could not be saved"); }
    finally { setBusy(false); }
  };
  return <details onToggle={event => setOpen(event.currentTarget.open)} className="mt-7 border border-black/10 bg-white p-5">
    <summary className="min-h-11 cursor-pointer font-serif text-2xl">Payment reminders <span className="ml-2 font-sans text-[10px] uppercase tracking-wider text-black/50">{settings.isError ? "Unavailable" : settings.data?.enabled ? "Enabled" : "Paused"}</span></summary>
    <p className="mt-3 max-w-2xl text-xs leading-6 text-black/55">Send one reminder after an order remains pending for 15 minutes. Paid, failed, cancelled and fulfilment-in-progress orders are excluded. The private Pay now and Cancel links expire after 48 hours. Orders still unpaid at that deadline are automatically cancelled and the customer receives a cancellation email. Pausing reminders does not remove deadlines from reminders already sent.</p>
    <p className="mt-2 max-w-2xl text-xs leading-6 text-black/55">Publish the new payment-reminder page on the live website before enabling. Reminder emails always link to the production site, even for orders placed from localhost. Enabling applies to new orders only.</p>
    {settings.isError && <p role="alert" className="mt-3 text-xs">Settings could not be loaded. Refresh this page.</p>}
    <button type="button" onClick={() => void toggle()} disabled={!settings.data || busy} className="mt-4 min-h-11 border border-black/20 px-4 text-[10px] uppercase tracking-wider disabled:opacity-40">{busy ? "Saving…" : settings.data?.enabled ? "Pause reminders" : "Enable reminders"}</button>
    {history.isError && <p role="alert" className="mt-4 text-xs">Reminder delivery history is unavailable.</p>}
    {history.data?.length === 0 && <p className="mt-5 text-xs text-black/45">No payment reminders yet.</p>}
    <div className="mt-4 divide-y divide-black/10">{history.data?.map(r => <div key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-4 text-xs"><div className="min-w-0"><Link to={`/admin/orders/${r.order_id}`} className="underline underline-offset-4">View order</Link><p className="mt-2 break-all text-black/55">{r.recipient || "Recipient set when sending"}</p><p className="mt-1 text-[10px] text-black/45">{date(r.created_at)}</p>{r.last_error && <p className="mt-2 leading-6 text-black/55">{r.last_error}</p>}</div><span className="text-[10px] uppercase tracking-wider">{r.delivery_status || r.status}</span></div>)}</div>
  </details>;
}
export function OrderPaymentReminder({ orderId }: { orderId: string }) {
  const reminder = useQuery({ queryKey: ["admin", "payment-reminder", orderId], queryFn: async () => {
    const { data, error } = await supabase.from("payment_reminders").select("status,sent_at,delivery_status,last_error").eq("order_id", orderId).maybeSingle(); if (error) throw error; return data;
  }, refetchInterval: 30000 });
  return <div className="mt-5 border-t border-black/10 pt-4"><p className="text-[10px] uppercase tracking-wider text-black/45">Payment reminder</p><p className="mt-2 text-xs leading-6 text-black/55">{reminder.isError ? "Status unavailable." : reminder.isLoading ? "Checking reminder…" : !reminder.data ? "No reminder recorded. Only eligible new, unpaid orders receive one reminder after 15 minutes when reminders are enabled." : `${reminder.data.delivery_status || reminder.data.status}${reminder.data.sent_at ? ` · ${date(reminder.data.sent_at)}` : ""}`}</p>{reminder.data?.last_error && <p className="mt-2 text-xs leading-6 text-black/55">{reminder.data.last_error}</p>}</div>;
}
