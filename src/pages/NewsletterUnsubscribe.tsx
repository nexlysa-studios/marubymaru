import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Check, Mail, ArrowLeft } from "lucide-react";

export default function NewsletterUnsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token ?? "");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const unsubscribe = async () => {
    if (!valid || state === "busy") return;
    setState("busy");
    try {
      const { error } = await supabase.functions.invoke(`newsletter?action=unsubscribe&token=${encodeURIComponent(token!)}`, { body: {} });
      if (error) throw error;
      setState("done");
    } catch { setState("error"); }
  };
  return <div className="mx-auto max-w-xl px-6 py-16 text-center sm:py-24">
    <div aria-hidden="true" className="mx-auto mb-8 flex h-14 w-14 items-center justify-center border border-black/15">{state === "done" ? <Check size={24} strokeWidth={1} /> : <Mail size={24} strokeWidth={1} />}</div>
    <p className="text-[10px] uppercase tracking-[0.2em] text-black/45">The Maru List</p>
    <h1 className="mt-4 font-serif text-4xl leading-tight sm:text-5xl">{state === "done" ? "You've been unsubscribed." : "Leave the Maru List?"}</h1>
    <p className="mt-6 text-sm leading-7 text-black/60">{!valid ? "This unsubscribe link isn't valid. Please use the link in your newsletter or contact us." : state === "done" ? "You won't receive further sale or promotion emails. Essential order confirmations are unaffected. A one-time unsubscribe confirmation is on its way to your inbox." : "Are you sure? You'll stop receiving our sale announcements and selected promo-code offers. You can stay on the list, or confirm below. Essential order and payment confirmations will still reach you."}</p>
    {state === "error" && <p role="alert" className="mt-4 text-sm">We couldn't update your preferences. Please try again.</p>}
    {valid && state !== "done" && <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
      <Link to="/shop" className="inline-flex min-h-12 items-center justify-center gap-3 bg-black px-6 text-[10px] uppercase tracking-widest text-white"><ArrowLeft size={14} />Keep me on the list</Link>
      <button type="button" onClick={() => void unsubscribe()} disabled={state === "busy"} className="min-h-12 border border-black/20 px-6 text-[10px] uppercase tracking-widest disabled:opacity-50">{state === "busy" ? "Updating…" : "Yes, unsubscribe"}</button>
    </div>}
    <div className="mt-8 flex justify-center gap-6 text-xs underline underline-offset-4"><Link to="/shop">Return to shop</Link><Link to="/contact">Contact us</Link></div>
  </div>;
}
