import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

export default function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [website, setWebsite] = useState("");
  const [successOpen, setSuccessOpen] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || !consent) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.functions.invoke("newsletter", { body: { email: email.trim(), consent, website } });
      if (error) {
        let details: { code?: string } | null = null;
        if ("context" in error && error.context instanceof Response) {
          try { details = await error.context.json(); } catch { /* Use the safe fallback below. */ }
        }
        if (details?.code === "already_subscribed") { setMessage("You're already on the Maru List. This email can't be subscribed twice."); return; }
        if (details?.code === "unavailable") { setMessage("This email can't be signed up again here. Contact marubymaru@icloud.com if you'd like to rejoin."); return; }
        throw error;
      }
      if (!data?.ok) throw new Error("Signup not confirmed");
      setMessage("You're subscribed. Your welcome email is on its way—no verification needed.");
      setEmail("");
      setConsent(false);
      setSuccessOpen(true);
    } catch { setMessage("We couldn't save your signup. Please try again in a moment."); }
    finally { setBusy(false); }
  }
  return (
    <section aria-label="Newsletter" className="bg-black text-white">
      <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8 md:py-20 lg:px-12 lg:py-24">
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12 lg:gap-24">
          <div>
            <div className="mb-6 flex items-center gap-4">
              <span aria-hidden="true" className="h-px w-8 bg-white/50" />
              <p className="text-[9px] uppercase tracking-[0.25em] text-white/65">Letters from Maru</p>
            </div>
            <h2 className="font-serif text-4xl leading-[1.08] sm:text-5xl lg:text-6xl">Join the <span className="italic">Maru List.</span></h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-white/65">New collections, private releases and stories from Maru. A little closer to our world.</p>
          </div>
          <div className="min-w-0 md:border-l md:border-white/20 md:pl-10 lg:pl-14">
            <p className="mb-5 font-serif text-2xl sm:text-3xl">A note, just for you.</p>
            <form onSubmit={handleSubmit}>
            <div className="flex min-w-0 items-stretch border border-white/40 transition-colors focus-within:border-white">
              <label htmlFor="newsletter-email" className="sr-only">Email address</label>
              <input ref={emailInput} id="newsletter-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" aria-describedby="newsletter-status" className="min-w-0 flex-1 rounded-none bg-transparent px-4 py-4 text-base text-white placeholder:text-white/55 focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-[-4px] focus-visible:outline-white sm:text-sm" />
              <button type="submit" disabled={busy} className="group flex min-h-14 shrink-0 items-center gap-3 bg-white px-5 text-[10px] uppercase tracking-[0.2em] text-black transition-colors duration-300 hover:bg-neutral-200 focus-visible:outline-offset-[-4px] disabled:opacity-50 sm:px-6">{busy ? "Joining…" : "Join"}<ArrowRight aria-hidden="true" size={15} strokeWidth={1} className="transition-transform duration-300 motion-safe:group-hover:translate-x-1" /></button>
            </div>
            <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 text-xs leading-6 text-white/65"><input type="checkbox" required checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-white" />I agree to receive sale and promotion emails from Maru By Maru. I can unsubscribe at any time.</label>
            <label className="hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={event => setWebsite(event.target.value)} /></label>
            </form>
            <p id="newsletter-status" role="status" aria-live="polite" className="mt-4 min-h-10 text-xs leading-6 text-white/65">{message || "Sale edits and selected offers. Never the noise."}</p>
            <Link to="/privacy" className="inline-flex min-h-11 items-center text-xs text-white/65 underline underline-offset-4">Privacy information</Link>
          </div>
        </div>
        <div aria-hidden="true" className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-white/20 pt-6 text-[8px] uppercase tracking-[0.2em] text-white/55 sm:gap-x-8 md:mt-14">
          <span>New collections</span><span className="h-0.5 w-0.5 bg-white/40" /><span>Private releases</span><span className="h-0.5 w-0.5 bg-white/40" /><span>Stories from Maru</span>
        </div>
      </div>
      <Dialog open={successOpen} onOpenChange={setSuccessOpen}>
        <DialogContent onCloseAutoFocus={event => { event.preventDefault(); emailInput.current?.focus({ preventScroll: true }); }} className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-none border-black/10 p-7 text-black shadow-none motion-reduce:animate-none sm:rounded-none sm:p-10 [&>button:last-child]:flex [&>button:last-child]:h-11 [&>button:last-child]:w-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center">
          <div aria-hidden="true" className="mb-3 flex h-12 w-12 items-center justify-center border border-black/15"><Check size={21} strokeWidth={1} /></div>
          <p className="text-[9px] uppercase tracking-[0.28em] text-black/45">The Maru List</p>
          <DialogTitle className="max-w-sm font-serif text-4xl font-normal leading-[1.1] tracking-normal sm:text-5xl">A little closer<br /><span className="italic">to Maru.</span></DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-7 text-black/60">You're subscribed. Look forward to sale edits and selected offers, thoughtfully delivered. No email verification is needed.</DialogDescription>
          <p className="flex items-start gap-3 border-y border-black/10 py-5 text-xs leading-6 text-black/55"><Mail size={16} strokeWidth={1.2} className="mt-1 shrink-0" />Your welcome confirmation is on its way. Check your spam folder too, and use its unsubscribe link whenever you wish.</p>
          <DialogClose asChild><Link to="/shop" className="mt-2 inline-flex min-h-12 items-center justify-between gap-4 bg-black px-5 text-[10px] uppercase tracking-[0.2em] text-white">Explore the collection<ArrowRight size={16} strokeWidth={1} /></Link></DialogClose>
          <DialogClose asChild><button type="button" className="min-h-11 text-[10px] uppercase tracking-[0.16em] underline underline-offset-4">Continue browsing</button></DialogClose>
        </DialogContent>
      </Dialog>
    </section>
  );
}
