import { Link } from "react-router-dom";
import elanImage from "@/assets/elan-cropped-trench-jacket.jpeg";

const aboutImage = "/About.jpeg";

const textLink = "inline-flex min-h-11 items-center border-b border-black/50 py-3 text-[10px] uppercase tracking-[0.2em] transition-opacity hover:opacity-60";
const principles = [
  { number: "01", title: "Timeless", text: "Pieces that stay in your wardrobe season after season." },
  { number: "02", title: "Effortless", text: "Easy to wear, easy to style, always put together." },
  { number: "03", title: "Versatile", text: "From everyday looks to dressed-up moments, style it your way." },
];

export default function About() {
  return (
    <div>
      <section className="store-section !pb-10 !pt-12 md:!pb-16 md:!pt-20">
        <p className="mb-6 text-center text-[9px] uppercase tracking-[0.28em] text-muted-foreground">The world of Maru</p>
        <h1 className="text-center font-serif text-[clamp(3rem,7vw,6.5rem)] leading-[1.05]">From Us to You</h1>
        <p className="mx-auto mt-6 max-w-sm text-center text-xs leading-6 text-muted-foreground">Thank you for making Maru part of your wardrobe.</p>
      </section>

      <section className="mx-auto grid max-w-[1440px] items-center gap-9 px-5 pb-14 sm:px-8 md:grid-cols-2 md:gap-12 md:pb-20 lg:gap-24 lg:px-12" aria-labelledby="our-story">
        <figure>
          <img src={aboutImage} alt="Maru by Maru — an appreciation for craft and simplicity" width={800} height={1000} className="aspect-[4/5] w-full object-cover" />
          <figcaption className="mt-4 flex justify-between gap-4 text-[8px] uppercase tracking-[0.2em] text-muted-foreground"><span>Maru by Maru</span><span>Made with intention</span></figcaption>
        </figure>
        <div className="max-w-md py-3 md:py-10">
          <p className="mb-5 text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Our story</p>
          <h2 id="our-story" className="font-serif text-4xl leading-tight lg:text-5xl">About Maru by Maru</h2>
          <p className="mt-7 font-serif text-2xl leading-relaxed">Founded in 2024, Maru by Maru is a Cape Town-based clothing brand inspired by effortless, timeless and modest style.</p>
          <div className="mt-5 space-y-5 text-sm leading-7 text-muted-foreground">
            <p>We’re all about pieces that make you feel confident, feminine and effortlessly put together whether you’re dressing up or keeping it simple.</p>
            <p>What started as a small dream in 2024 has grown into a beautiful community of Maru girls, and we’re so grateful for every bit of love and support along the way.</p>
            <p>Welcome to Maru — your new favourite wardrobe, one piece at a time. ♡</p>
          </div>
          <Link to="/shop" className={textLink + " mt-6"}>Explore the collection →</Link>
        </div>
      </section>

      <section className="border-y border-black/10 bg-muted/40" aria-labelledby="our-perspective">
        <div className="store-section">
          <div className="mb-10 md:mb-14"><p className="mb-4 text-[9px] uppercase tracking-[0.25em] text-muted-foreground">The Maru perspective</p><h2 id="our-perspective" className="font-serif text-4xl md:text-5xl">Less, with meaning.</h2></div>
          <div className="grid gap-8 md:grid-cols-3 md:gap-10 lg:gap-16">{principles.map((principle) => <div key={principle.number} className="border-t border-black/15 pt-5"><span className="text-[10px] text-muted-foreground">{principle.number}</span><h3 className="mb-4 mt-5 font-serif text-2xl lg:text-3xl">{principle.title}</h3><p className="max-w-sm text-xs leading-7 text-muted-foreground">{principle.text}</p></div>)}</div>
        </div>
      </section>

      <section className="store-section">
        <div className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr] md:gap-16 lg:gap-24">
          <div className="max-w-md md:py-8">
            <p className="mb-6 text-[9px] uppercase tracking-[0.25em] text-muted-foreground">The Maru woman</p>
            <h2 className="font-serif text-4xl leading-tight lg:text-5xl">Find your next favourite piece</h2>
            <p className="mt-6 text-sm leading-7 text-muted-foreground">From everyday essentials to pieces for special moments, discover styles made to become part of your wardrobe.</p>
            <div className="mt-7 flex flex-wrap gap-x-8 gap-y-3"><Link to="/shop?collection=new" className={textLink}>Discover new arrivals →</Link><Link to="/contact" className={textLink}>Get in touch →</Link></div>
          </div>
          <img src={elanImage} alt="Two women wearing ELAN cropped trench jackets" width={800} height={1000} loading="lazy" className="aspect-[4/5] w-full object-cover" />
        </div>
      </section>
    </div>
  );
}
