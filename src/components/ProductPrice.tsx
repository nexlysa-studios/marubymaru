import { sellingPrice, percentOff } from "@/lib/pricing";
import { formatCurrency } from "@/lib/shipping";

export default function ProductPrice({ product, quantity = 1 }: { product: { price: number; salePrice?: number | null }; quantity?: number }) {
  const current = sellingPrice(product);
  return <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-2 gap-y-1">
    {current < product.price && <><del className="text-black/40"><span className="sr-only">Original price </span>{formatCurrency(product.price * quantity)}</del><span className="sr-only">Sale price </span></>}
    <span>{formatCurrency(current * quantity)}</span>
    {current < product.price && <span className="text-[9px] uppercase tracking-wider text-black/55">{percentOff(product) || "<1"}% off</span>}
  </span>;
}
