import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { percentOff, sellingPrice } from "@/lib/pricing";
import ProductPrice from "@/components/ProductPrice";
afterEach(cleanup);
describe("sale pricing", () => {
  it.each([null, undefined, 0, -1, 800, 900])("ignores invalid or missing sale price %s", salePrice => {
    expect(sellingPrice({ price: 800, salePrice })).toBe(800);
  });
  it("calculates the actual saving without overstating rounded percentages", () => {
    expect(sellingPrice({ price: 800, salePrice: 600 })).toBe(600);
    expect(percentOff({ price: 800, salePrice: 600 })).toBe(25);
    expect(percentOff({ price: 999, salePrice: 800 })).toBe(19);
  });
  it("renders a semantic struck-through regular price and quantity-based sale total", () => {
    const view = render(<ProductPrice product={{ price: 800, salePrice: 600 }} quantity={2} />);
    expect(view.container.querySelector("del")).toHaveTextContent(/1\s*600/);
    expect(screen.getByText(/1\s*200/)).toBeInTheDocument(); expect(screen.getByText("25% off")).toBeInTheDocument();
  });
});
