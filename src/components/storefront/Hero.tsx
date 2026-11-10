import { useCallback, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import heroImage from "@/assets/hero.png";

export default function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);

  const attemptPlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    void video.play().catch(() => {});
  }, []);

  useEffect(() => {
    const resumeWhenVisible = () => {
      if (document.visibilityState === "visible") attemptPlayback();
    };

    document.addEventListener("visibilitychange", resumeWhenVisible);
    return () => document.removeEventListener("visibilitychange", resumeWhenVisible);
  }, [attemptPlayback]);

  return (
    <section className="relative flex min-h-[560px] h-[calc(100svh-4rem)] max-h-[1050px] items-center justify-center overflow-hidden bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        poster={heroImage}
        preload="auto"
        onCanPlay={attemptPlayback}
        className="absolute inset-0 h-full w-full object-cover"
        aria-hidden="true"
      >
        <source src="/videos/hero.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 bg-black/20" />
      <div className="relative px-5 py-16 text-center text-white sm:px-8">
        <h1 className="mx-auto mb-3 max-w-5xl font-serif text-[clamp(2.5rem,5.5vw,5.5rem)] leading-[1.06] tracking-wide animate-fade-in">Shop Maru By Maru</h1>
        <div className="flex flex-col items-center gap-3 animate-fade-in-delay-2">
          <Link to="/shop" className="group relative isolate overflow-hidden border border-white bg-transparent px-7 py-4 text-[10px] uppercase tracking-[0.22em] text-white transition-colors duration-500 ease-out hover:text-black focus-visible:text-black">
            <span aria-hidden="true" className="absolute inset-0 -z-10 origin-left scale-x-0 bg-white transition-transform duration-500 ease-out group-hover:scale-x-100 group-focus-visible:scale-x-100" />
            Shop the Collection
          </Link>
          <Link to="/shop?collection=new" className="px-4 py-3 text-[9px] uppercase tracking-[0.22em] underline decoration-white/50 underline-offset-8 transition-opacity hover:opacity-70">View New Arrivals</Link>
        </div>
      </div>
    </section>
  );
}
