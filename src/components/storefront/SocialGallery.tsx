import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { Product } from "@/data/products";
import { Skeleton } from "@/components/ui/skeleton";

const maruWomanSlides = [
  "/Slider (1).JPEG",
  "/Slider (2).JPEG",
  "/Slider (3).JPEG",
  "/Slider (4).JPEG",
  "/Slider (5).JPEG",
  "/Slider (6).JPEG",
  "/Slider (7).JPEG",
];

export default function SocialGallery({ products, loading, error }: {
  products: Product[];
  loading: boolean;
  error: boolean;
}) {
  if (error) return <p role="alert" className="py-8 text-center text-sm text-muted-foreground">The gallery is temporarily unavailable. Please try again shortly.</p>;
  if (loading) return (
    <div role="status" aria-label="Loading the Maru gallery" className="maru-gallery">
      <span className="sr-only">Loading the Maru gallery…</span>
      <div aria-hidden="true" className="maru-gallery-group">
        {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="maru-gallery-card aspect-square rounded-none" />)}
      </div>
    </div>
  );

  const galleryImages = maruWomanSlides.length
    ? maruWomanSlides
    : products.flatMap((product) => [product.images[1] || product.images[0] || "/placeholder.svg"]);

  if (!galleryImages.length) return <p className="py-8 text-center text-sm text-muted-foreground">New pieces will appear here soon.</p>;

  // Keep each half wider than the viewport even for a small catalogue.
  // Two identical halves, including their trailing gap, make the loop seamless.
  const copies = Math.max(1, Math.ceil(6 / galleryImages.length));
  const sequence = Array.from({ length: copies }, () => galleryImages).flat();
  const style = { "--gallery-duration": `${sequence.length * 8}s` } as CSSProperties;
  const useStaticSlides = maruWomanSlides.length > 0;

  return (
    <div className="maru-gallery" aria-label="Explore the Maru collection">
      <div className="maru-gallery-track" style={style}>
        {[0, 1].map((half) => (
          <div key={half} className="maru-gallery-group" aria-hidden={half === 1 ? true : undefined}>
            {sequence.map((image, index) => {
              const duplicate = half === 1 || index >= galleryImages.length;
              const imageEl = (
                <img
                  src={image}
                  alt="Maru by Maru editorial"
                  width={500}
                  height={500}
                  loading="eager"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.025]"
                />
              );

              if (useStaticSlides) {
                return (
                  <div
                    key={`${image}-${index}`}
                    className="maru-gallery-card group block aspect-square overflow-hidden bg-muted focus-visible:outline-offset-[-4px]"
                    aria-hidden={duplicate ? true : undefined}
                    data-gallery-duplicate={duplicate ? "true" : undefined}
                  >
                    {imageEl}
                  </div>
                );
              }

              return (
                <Link
                  key={`${image}-${index}`}
                  to={`/product/${encodeURIComponent(image)}`}
                  className="maru-gallery-card group block aspect-square overflow-hidden bg-muted focus-visible:outline-offset-[-4px]"
                  aria-label="Explore the Maru collection"
                  aria-hidden={duplicate ? true : undefined}
                  tabIndex={duplicate ? -1 : undefined}
                  data-gallery-duplicate={duplicate ? "true" : undefined}
                >
                  {imageEl}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
