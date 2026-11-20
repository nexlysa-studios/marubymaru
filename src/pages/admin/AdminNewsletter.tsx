import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Loader2, Mail, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Campaign { id: string; kind: string; title: string; status: string; due_at: string; created_at: string; last_error: string | null; recipients: number; sent: number; delivered: number; failed: number; skipped: number }
interface Summary { subscribed: number; unsubscribed: number; suppressed: number; campaigns: Campaign[] }
const date = (value: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value)) + " SAST";
const field = "mt-2 min-h-11 w-full border border-black/20 bg-white px-3 py-2 text-sm outline-none focus:border-black";
export default function AdminNewsletter() {
  const cache = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState("all");
  const [address, setAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ id: string; html: string; subject: string; recipients: number; admin_email: string } | null>(null);
  const summary = useQuery({ queryKey: ["admin", "newsletter-summary"], queryFn: async () => {
    const { data, error } = await supabase.rpc("newsletter_admin_summary"); if (error) throw error;
    return data as unknown as Summary;
  }, refetchInterval: 15000 });
  const settings = useQuery({ queryKey: ["admin", "newsletter-settings"], queryFn: async () => {
    const { data, error } = await supabase.from("newsletter_settings").select("sending_enabled,mailing_address").eq("id", true).single(); if (error) throw error; return data;
  } });
  const subscribers = useQuery({ queryKey: ["admin", "newsletter-subscribers", search, page, status], queryFn: async () => {
    let query = supabase.from("newsletter_subscribers").select("id,email,status,subscribed_at,unsubscribed_at", { count: "exact" }).order("created_at", { ascending: false }).range(page * 25, page * 25 + 24);
    if (search.trim()) query = query.ilike("email", `%${search.trim().replace(/[%_\\]/g, "")}%`);
    if (status !== "all") query = query.eq("status", status);
    const { data, count, error } = await query; if (error) throw error; return { rows: data ?? [], count: count ?? 0 };
  } });
  const confirmations = useQuery({ queryKey: ["admin", "subscription-notifications"], queryFn: async () => {
    const { data, error } = await supabase.from("subscription_notifications").select("id,kind,status,recipient,delivery_status,last_error,created_at").order("created_at", { ascending: false }).limit(20);
    if (error) throw error;
    return data;
  }, refetchInterval: 15000 });
  const refresh = () => void cache.invalidateQueries({ queryKey: ["admin"] });
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : "This action could not be completed."); } finally { setBusy(false); } };
  const saveSettings = (enabled: boolean) => run(async () => {
    const mailingAddress = (address ?? settings.data?.mailing_address ?? "").trim();
    if (enabled && mailingAddress.length < 10) throw new Error("Add the business physical/postal address before enabling campaigns.");
    const { error } = await supabase.from("newsletter_settings").update({ sending_enabled: enabled, mailing_address: mailingAddress }).eq("id", true); if (error) throw error;
    setAddress(null); toast.success(enabled ? "Newsletter sending enabled" : "Settings saved; campaign sending is paused");
  });
  const previewCampaign = (id: string) => run(async () => {
    const { data, error } = await supabase.functions.invoke("marketing-admin", { body: { action: "preview", campaign_id: id } });
    if (error || data?.error) throw new Error(data?.error || "Preview unavailable. A scheduled offer may not be active yet.");
    setPreview({ ...data, id });
  });
  return <div className="min-w-0 px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
    <header className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-[10px] uppercase tracking-[0.25em] text-black/45">Letters from Maru</p><h1 className="mt-2 font-serif text-4xl sm:text-5xl">The Maru List</h1><p className="mt-4 max-w-xl text-sm leading-7 text-black/55">Subscribers, sale announcements and selected offers. Separate from essential order receipts.</p></div><button type="button" onClick={refresh} className="flex min-h-11 items-center gap-2 border border-black/20 px-4 text-xs"><RefreshCw size={14} />Refresh</button></header>
    {summary.isLoading && <p role="status" className="mt-8 flex gap-3 text-sm"><Loader2 className="motion-safe:animate-spin" size={16} />Loading newsletter</p>}
    {(summary.isError || settings.isError) && <p role="alert" className="mt-6 border border-black/20 p-4 text-sm">Newsletter information could not be loaded. Refresh to try again.</p>}
    {summary.data && <section aria-label="Subscriber summary" className="mt-8 grid grid-cols-1 divide-y divide-black/10 border border-black/10 bg-white min-[375px]:grid-cols-3 min-[375px]:divide-x min-[375px]:divide-y-0">{(["subscribed", "unsubscribed", "suppressed"] as const).map(key => <div key={key} className="min-w-0 p-3 sm:p-6"><p className="break-words text-[9px] uppercase tracking-wider text-black/50">{key}</p><p className="mt-3 font-serif text-3xl">{summary.data[key]}</p></div>)}</section>}
    <section className="mt-8 border border-black/10 bg-white p-5 sm:p-7">
      <h2 className="font-serif text-2xl">Sending settings</h2>
      <p className="mt-3 text-xs leading-6 text-black/55">{settings.data?.sending_enabled ? "Campaign sending is enabled." : "Campaign sending is paused. Signups remain open."} Campaign emails show marubymaru@icloud.com as the contact email.</p>
      <p className="mt-2 text-xs leading-6 text-black/55">Welcome and unsubscribe confirmations, including admin notifications, are separate and continue even while campaigns are paused.</p>
      <label className="mt-5 block text-[10px] uppercase tracking-wider">Business physical/postal address<textarea value={address ?? settings.data?.mailing_address ?? ""} onChange={e => setAddress(e.target.value)} rows={2} maxLength={500} className={`${field} resize-y`} placeholder="The real business mailing address, not an email address" /></label>
      <p className="mt-2 text-xs leading-6 text-black/45">This address appears in marketing email footers. Enabling sending releases eligible queued campaigns automatically; review the announcements below first.</p>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={busy || !settings.data} onClick={() => void saveSettings(settings.data?.sending_enabled ?? false)} className="min-h-11 border border-black/20 px-4 text-xs disabled:opacity-40">Save address</button><button type="button" disabled={busy || !settings.data} onClick={() => { const enabled = !settings.data?.sending_enabled; if (!enabled || window.confirm("Enable automatic sending of eligible queued sale and promo campaigns to subscribed readers?")) void saveSettings(enabled); }} className="min-h-11 bg-black px-4 text-xs text-white disabled:opacity-40">{settings.data?.sending_enabled ? "Pause sending" : "Enable sending"}</button></div>
    </section>
    <section aria-label="Newsletter announcements" className="mt-8 border border-black/10 bg-white p-5 sm:p-7">
      <h2 className="font-serif text-2xl">Announcements</h2><p className="mt-3 text-xs leading-6 text-black/50">Sale announcements start sending immediately after saving, normally within a few seconds. Coupon emails are optional and wait until the offer begins. Sent means accepted by Resend; delivered means accepted by the recipient's mail server, not read.</p>
      {!summary.data?.campaigns.length && <p className="mt-6 text-sm text-black/45">No announcements yet. Existing sales and coupons are not emailed retroactively.</p>}
      <div className="mt-4 divide-y divide-black/10">{summary.data?.campaigns.map(c => <article key={c.id} className="min-w-0 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h3 className="font-serif text-xl">{c.title}</h3><p className="mt-2 text-[10px] uppercase tracking-wider text-black/55">{c.kind} · {c.status}</p><p className="mt-2 text-xs leading-6 text-black/45">{["queued", "collecting"].includes(c.status) ? "Earliest send" : "Planned send"}: {date(c.due_at)}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void previewCampaign(c.id)} aria-label={`Preview ${c.title}`} className="flex min-h-11 items-center gap-2 border border-black/15 px-3 text-xs"><Eye size={14} />Preview</button>{["collecting", "queued"].includes(c.status) && <button type="button" disabled={busy} onClick={() => { if (window.confirm("Cancel this announcement? This does not change the sale or coupon.")) void run(async () => { const { error } = await supabase.rpc("cancel_marketing_campaign", { p_id: c.id }); if (error) throw error; }); }} className="flex min-h-11 items-center gap-2 border border-black/15 px-3 text-xs"><X size={14} />Cancel</button>}</div></div>
        <p className="mt-4 text-xs leading-6 text-black/55">{c.recipients} recipients · {c.sent} sent · {c.delivered} delivered · {c.failed} need review · {c.skipped} skipped</p>{c.last_error && <p className="mt-2 text-xs leading-6 text-black/55">{c.last_error}</p>}
      </article>)}</div>
    </section>
    <section aria-label="Subscription confirmations" className="mt-8 border border-black/10 bg-white p-5 sm:p-7">
      <h2 className="font-serif text-2xl">Signup &amp; unsubscribe emails</h2>
      <p className="mt-3 text-xs leading-6 text-black/50">Latest 20 confirmations. Sent means accepted by Resend; delivered means accepted by the recipient's mail server. New requests normally start sending within a minute. Duplicate requests do not send new emails.</p>
      {confirmations.isError && <p role="alert" className="mt-4 text-xs">Confirmation status could not be loaded. Refresh to try again.</p>}
      {!confirmations.isLoading && !confirmations.isError && !confirmations.data?.length && <p className="mt-5 text-sm text-black/45">No subscription confirmations yet.</p>}
      <div className="mt-4 divide-y divide-black/10">{confirmations.data?.map(n => <div key={n.id} className="flex flex-col justify-between gap-3 py-4 sm:flex-row">
        <div className="min-w-0"><p className="text-xs">{{ welcome: "Subscriber welcome", admin_subscribed: "Admin: new subscriber", goodbye: "Subscriber unsubscribe confirmation", admin_unsubscribed: "Admin: subscriber left" }[n.kind] ?? n.kind}</p>
          <p className="mt-2 break-all text-xs text-black/55">{n.recipient || "Recipient set when sending"}</p><p className="mt-1 text-[10px] leading-5 text-black/45">{date(n.created_at)}</p>
          {n.last_error && <p className="mt-2 text-xs leading-6 text-black/55">{n.last_error}</p>}</div>
        <span className="text-[10px] uppercase tracking-wider text-black/50">{n.delivery_status || n.status}</span>
      </div>)}</div>
    </section>
    {preview && <section aria-label="Email preview" className="mt-8 border border-black/10 bg-white p-5 sm:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-2xl">{preview.subject}</h2><button type="button" onClick={() => setPreview(null)} className="min-h-11 px-3 text-xs underline">Close preview</button></div><p className="mt-3 text-xs leading-6 text-black/50">Up to {preview.recipients} currently eligible subscribers. Opt-outs and availability are checked again before sending.</p><iframe title="Newsletter email preview" sandbox="" referrerPolicy="no-referrer" srcDoc={preview.html} className="mt-5 h-[600px] w-full border border-black/10" /><button type="button" disabled={busy} onClick={() => void run(async () => { const { data, error } = await supabase.functions.invoke("marketing-admin", { body: { action: "test", campaign_id: preview.id, request_id: crypto.randomUUID() } }); if (error || data?.error) throw new Error(data?.error || "Test email unavailable. Please check the provider log before retrying."); toast.success(`Test accepted for ${data.recipient}`); })} className="mt-4 flex min-h-11 items-center gap-2 border border-black/20 px-4 text-xs"><Mail size={14} />Send test to {preview.admin_email}</button></section>}
    <section className="mt-8 border border-black/10 bg-white p-5 sm:p-7"><h2 className="font-serif text-2xl">Subscribers</h2><div className="mt-5 flex flex-col gap-4 sm:flex-row"><label className="min-w-0 flex-1 text-[10px] uppercase tracking-wider">Search email<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className={field} /></label><label className="text-[10px] uppercase tracking-wider">Status<select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }} className={field}><option value="all">All statuses</option><option value="subscribed">Subscribed</option><option value="unsubscribed">Unsubscribed</option><option value="suppressed">Suppressed</option></select></label></div>
      {subscribers.isError && <p role="alert" className="mt-4 text-sm">Subscriber list is unavailable.</p>}
      <div className="mt-5 divide-y divide-black/10">{subscribers.data?.rows.map(s => <div key={s.id} className="flex flex-col justify-between gap-2 py-4 sm:flex-row"><div className="min-w-0"><p className="break-all text-sm">{s.email}</p><p className="mt-1 text-[10px] leading-5 text-black/45">Joined {date(s.subscribed_at)}</p></div><span className="text-[10px] uppercase tracking-wider text-black/50">{s.status}</span></div>)}</div>
      {subscribers.data?.count === 0 && <p className="mt-5 text-sm text-black/45">No matching subscribers.</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4 text-xs"><p>{subscribers.data?.count ?? 0} subscribers · Page {page + 1}</p><div className="flex gap-3"><button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="min-h-11 px-3 underline disabled:opacity-30">Previous</button><button type="button" disabled={(page + 1) * 25 >= (subscribers.data?.count ?? 0)} onClick={() => setPage(page + 1)} className="min-h-11 px-3 underline disabled:opacity-30">Next</button></div></div>
    </section>
  </div>;
}
