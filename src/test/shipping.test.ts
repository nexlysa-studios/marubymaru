import { describe, expect, it } from "vitest";
import { shippingAmount } from "@/lib/shipping";

const policy = { flat_rate: 99, free_shipping_threshold: 1500 };

describe("backend policy shipping preview", () => {
  it.each([[1, 0, 99], [1499.99, 0, 99], [1500, 0, 0], [1500.01, 0, 0],
    [1600, 100, 0], [1600, 100.01, 99], [1600, 150, 99], [100, 100, 99]])(
    "quotes R%s less R%s discount as R%s shipping", (subtotal, discount, shipping) => {
      expect(shippingAmount(subtotal, discount, policy)).toBe(shipping);
    },
  );

  it("reads rates from the fetched policy instead of hardcoded storefront fees", () => {
    expect(shippingAmount(1500, 0, { flat_rate: 120, free_shipping_threshold: 2000 })).toBe(120);
  });
});
