import { useState } from "react";
import { X } from "lucide-react";
import { isTikTokInAppBrowser } from "@/lib/tiktokBrowser";

export default function TikTokBrowserNotice() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || !isTikTokInAppBrowser(navigator.userAgent)) return null;

  return (
    <aside aria-label="TikTok browser tip" className="border-y border-black/10 bg-neutral-50">
      <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-5 py-3 sm:px-8 lg:px-12">
        <p className="text-xs leading-relaxed text-black/75">
          <span className="font-medium text-black">Browsing from TikTok?</span>{" "}
          For the best experience, tap the share or menu button and choose “Open in browser.”
        </p>
        <button
          type="button"
          aria-label="Dismiss browser tip"
          onClick={() => setDismissed(true)}
          className="flex h-11 w-11 shrink-0 items-center justify-center text-black/60 transition-colors hover:text-black"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
