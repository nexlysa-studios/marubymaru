export function sellingPrice(product: { price: number; salePrice?: number | null }) {
  return product.salePrice != null && product.salePrice > 0 && product.salePrice < product.price ? product.salePrice : product.price;
}

export function percentOff(product: { price: number; salePrice?: number | null }) {
  // Round down so the badge never overstates the actual saving.
  return product.price > 0 ? Math.floor((1 - sellingPrice(product) / product.price) * 100 + 1e-8) : 0;
}
