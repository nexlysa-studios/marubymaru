import { useState } from "react";
import { sellingPrice } from "@/lib/pricing";
import { Link, useSearchParams } from "react-router-dom";
import { SlidersHorizontal, X } from "lucide-react";
import { useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useCategories";
import ProductGrid from "@/components/storefront/ProductGrid";
import ShopFilters from "@/components/storefront/ShopFilters";
import { Sheet, SheetContent, SheetTitle, SheetDescription, SheetTrigger, SheetClose } from "@/components/ui/sheet";

export default function Shop() {
  const products = useProducts();
  const categories = useCategories();
  const [params, setParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const selectedSlug = params.get("category");
  const collection = params.get("collection");
  const size = params.get("size");
  const sort = params.get("sort") || "curated";
  const category = categories.data?.find((item) => item.slug === selectedSlug);
  const readPrice = (key: string) => {
    const value = params.get(key);
    return value?.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  };
  const min = readPrice("min");
  const max = readPrice("max");
  const filtered = (products.data ?? []).filter((product) =>
    (!selectedSlug || (category && product.categoryId === category.id)) &&
    (collection !== "new" || product.category === "new") &&
    (collection !== "loved" || product.isFeatured || product.isBestseller) &&
    (collection !== "sale" || sellingPrice(product) < product.price) &&
    (!size || product.sizes.includes(size)) &&
    (min === null || sellingPrice(product) >= min) && (max === null || sellingPrice(product) <= max),
  );
  if (sort === "price-asc") filtered.sort((a, b) => sellingPrice(a) - sellingPrice(b));
  if (sort === "price-desc") filtered.sort((a, b) => sellingPrice(b) - sellingPrice(a));
  if (sort === "name") filtered.sort((a, b) => a.name.localeCompare(b.name));
  const loading = products.isLoading || categories.isLoading;
  const error = products.isError || categories.isError;
  const updateFilters = (values: Record<string, string | null>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(values).forEach(([key, value]) => { if (value) next.set(key, value); else next.delete(key); });
      return next;
    }, { preventScrollReset: true });
  };
  const activeFilters = [
    ...(selectedSlug ? [{ key: "category", label: category?.name || selectedSlug }] : []),
    ...(["new", "loved", "sale"].includes(collection ?? "") ? [{ key: "collection", label: collection === "sale" ? "Sale" : collection === "new" ? "New arrivals" : "Most loved" }] : []),
    ...(size ? [{ key: "size", label: `Size ${size}` }] : []),
    ...(min !== null ? [{ key: "min", label: `From R${min}` }] : []),
    ...(max !== null ? [{ key: "max", label: `Up to R${max}` }] : []),
  ];
  const reset = () => updateFilters({ category: null, collection: null, size: null, min: null, max: null });
  const filterProps = { categories: categories.data ?? [], products: products.data ?? [], params, onChange: updateFilters };

  return (
    <div className="mx-auto max-w-[1600px] px-5 pb-16 pt-10 sm:px-8 md:pb-24 md:pt-16 lg:px-12">
      <header className="mb-8 border-b border-black/10 pb-9 md:mb-10 md:pb-12">
        <p className="mb-4 text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Maru by Maru / The wardrobe</p>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <h1 className="font-serif text-5xl leading-tight md:text-6xl">{collection === "sale" ? "The Sale Edit" : collection === "new" ? "New Arrivals" : collection === "loved" ? "Most Loved" : category?.name || "The Collection"}</h1>
          <p className="max-w-xs text-xs leading-6 text-muted-foreground">Considered silhouettes. Effortless expression.<br />Find the pieces that feel like you.</p>
        </div>
      </header>
      <nav aria-label="Collection shortcuts" className="mb-6 flex flex-wrap gap-3">
        <Link to="/shop" aria-current={!collection && !selectedSlug ? "page" : undefined} className={`inline-flex min-h-11 items-center border px-4 text-[10px] uppercase tracking-[0.18em] ${!collection && !selectedSlug ? "border-black bg-black text-white" : "border-black/15 hover:border-black"}`}>All pieces</Link>
        <Link to="/shop?collection=sale" aria-current={collection === "sale" ? "page" : undefined} className={`inline-flex min-h-11 items-center border px-4 text-[10px] uppercase tracking-[0.18em] ${collection === "sale" ? "border-black bg-black text-white" : "border-black/15 hover:border-black"}`}>Sale edit</Link>
      </nav>
      <div className="grid items-start gap-8 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-9 xl:grid-cols-[220px_minmax(0,1fr)] xl:gap-12">
        <aside aria-label="Shop filters" className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto overscroll-contain pr-5 lg:block">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-sans text-[10px] uppercase tracking-[0.2em]">Filter by</h2>
            {!!activeFilters.length && <button type="button" onClick={reset} className="min-h-11 text-[10px] text-muted-foreground underline underline-offset-4">Clear all</button>}
          </div>
          <ShopFilters {...filterProps} />
        </aside>
        <section aria-label="Shop products" className="min-w-0">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b border-black/10 pb-4">
            <p role="status" aria-live="polite" className="text-[11px] text-muted-foreground">{loading ? "Loading pieces…" : error ? "Collection unavailable" : `${filtered.length} ${filtered.length === 1 ? "piece" : "pieces"}`}</p>
            <div className="flex flex-wrap items-center gap-3 sm:gap-6">
              <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
                <SheetTrigger asChild><button type="button" className="flex min-h-11 items-center gap-2 text-[10px] uppercase tracking-wider lg:hidden"><SlidersHorizontal size={14} strokeWidth={1} />Filters{activeFilters.length ? ` (${activeFilters.length})` : ""}</button></SheetTrigger>
                <SheetContent side="left" className="z-[60] flex w-[min(90vw,360px)] flex-col p-0">
                  <div className="border-b border-black/10 px-6 pb-5 pt-8"><SheetTitle className="font-serif text-3xl font-normal">Find your pieces</SheetTitle><SheetDescription className="mt-2 text-xs">A wardrobe, considered by you.</SheetDescription></div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6"><ShopFilters {...filterProps} /></div>
                  <div className="flex items-center gap-4 border-t border-black/10 p-5">
                    <button type="button" onClick={reset} className="min-h-11 shrink-0 text-xs underline underline-offset-4">Clear all</button>
                    <SheetClose asChild><button type="button" className="min-h-12 flex-1 bg-black px-3 text-[10px] uppercase tracking-wider text-white">View {loading ? "" : filtered.length} pieces</button></SheetClose>
                  </div>
                </SheetContent>
              </Sheet>
              <label className="flex min-h-11 items-center gap-2 text-[10px] text-muted-foreground">
                <span className="sr-only sm:not-sr-only">Sort by</span>
                <select aria-label="Sort by" value={sort} onChange={(event) => updateFilters({ sort: event.target.value === "curated" ? null : event.target.value })} className="min-h-11 max-w-[150px] bg-transparent pr-1 text-[11px] text-black">
                  <option value="curated">Maru selection</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name">Name: A–Z</option>
                </select>
              </label>
            </div>
          </div>
          {!!activeFilters.length && <div className="mb-6 flex flex-wrap gap-2" aria-label="Active filters">{activeFilters.map((filter) => <button type="button" key={filter.key} onClick={() => updateFilters({ [filter.key]: null })} aria-label={`Remove ${filter.label} filter`} className="inline-flex min-h-9 max-w-full items-center gap-3 border border-black/10 px-3 text-[10px] transition-colors hover:bg-muted"><span className="break-all">{filter.label}</span><X size={12} className="shrink-0" /></button>)}</div>}
          {error || loading ? <ProductGrid products={[]} loading={loading} error={error} compact /> : selectedSlug && !category ? (
            <div className="py-16 text-center"><p className="font-serif text-2xl">This category is unavailable.</p><Link to="/shop" className="mt-5 inline-flex min-h-11 items-center text-xs underline underline-offset-4">Browse all pieces</Link></div>
          ) : !filtered.length && activeFilters.length ? (
            <div className="py-16 text-center"><h2 className="font-serif text-3xl">A little more room to explore.</h2><p className="mt-3 text-xs leading-6 text-muted-foreground">No pieces match this selection. Try adjusting your filters.</p><button type="button" onClick={reset} className="mt-5 min-h-11 border-b border-black text-[10px] uppercase tracking-widest">Clear filters</button></div>
          ) : <ProductGrid products={filtered} compact />}
        </section>
      </div>
    </div>
  );
}
