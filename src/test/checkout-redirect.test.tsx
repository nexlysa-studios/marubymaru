import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Checkout from "@/pages/Checkout";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn(), clearCart: vi.fn(), useCart: vi.fn(), useShippingPolicy: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: mocks.rpc, functions: { invoke: mocks.invoke } },
}));
vi.mock("@/context/CartContext", () => ({ useCart: mocks.useCart }));
vi.mock("@/hooks/useShippingPolicy", () => ({ useShippingPolicy: mocks.useShippingPolicy }));

const cart = () => ({
  items: [{ product: { id: "dress", name: "Maru Dress", price: 650, images: [] }, size: "M", quantity: 1 }],
  totalPrice: 650,
  clearCart: mocks.clearCart,
});
const page = () => <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Checkout /></MemoryRouter>;
const submitCheckout = () => fireEvent.submit(screen.getByRole("button", { name: "Pay securely with PayFast" }).closest("form")!);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.useCart.mockImplementation(cart);
  mocks.useShippingPolicy.mockReturnValue({ data: { flat_rate: 99, free_shipping_threshold: 1500 }, isError: false, refetch: vi.fn() });
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("checkout payment handoff notice", () => {
  it("stays visible while preparing payment and after the cart clears for the gateway redirect", async () => {
    let finishOrder: (value: unknown) => void;
    let finishPayment: (value: unknown) => void;
    mocks.rpc.mockImplementation(() => new Promise((resolve) => { finishOrder = resolve; }));
    mocks.invoke.mockImplementation(() => new Promise((resolve) => { finishPayment = resolve; }));
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    mocks.clearCart.mockImplementation(() => mocks.useCart.mockReturnValue({ ...cart(), items: [], totalPrice: 0 }));
    const view = render(page());
    submitCheckout();
    expect(screen.getByRole("status")).toHaveTextContent("Redirecting you to PayFast...");
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
    expect(screen.getByRole("heading", { name: "Redirecting you to PayFast..." })).toHaveFocus();
    await act(async () => { finishOrder({ data: { id: "order-1", order_number: "MBM-TEST", total: 650 }, error: null }); });
    expect(screen.getByRole("status")).toHaveTextContent("Please keep this page open");
    expect(mocks.clearCart).not.toHaveBeenCalled();
    await act(async () => { finishPayment({ data: { action: "https://sandbox.payfast.co.za/eng/process", fields: { amount: "650.00" } }, error: null }); });
    view.rerender(page());
    expect(mocks.clearCart).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledTimes(1);
    const paymentForm = document.querySelector<HTMLFormElement>('form[action="https://sandbox.payfast.co.za/eng/process"]');
    expect(paymentForm?.method).toBe("post");
    expect(paymentForm?.action).toBe("https://sandbox.payfast.co.za/eng/process");
    expect(paymentForm?.querySelector("input")?.value).toBe("650.00");
    expect(screen.getByRole("status")).toHaveTextContent("Redirecting you to PayFast...");
    expect(screen.queryByText("Your cart is empty.")).not.toBeInTheDocument();
    paymentForm?.remove();
  });

  it.each([[650, 749, false], [1499.99, 1598.99, false], [1500, 1500, true], [1500.01, 1500.01, true]])(
    "includes shipping in the displayed total for a R%s basket", (subtotal, total, free) => {
      mocks.useCart.mockReturnValue({ ...cart(), totalPrice: subtotal });
      render(page());
      const format = (amount: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount).replace(/\s/g, " ");
      expect(screen.getByText("Total").nextElementSibling).toHaveTextContent(format(total));
      expect(screen.getByText("Shipping").nextElementSibling).toHaveTextContent(free ? "Free" : format(99));
    },
  );

  it("recalculates shipping eligibility after a coupon is applied and removed", async () => {
    mocks.useCart.mockReturnValue({ ...cart(), totalPrice: 1600 });
    mocks.rpc.mockResolvedValue({ data: { code: "MARU150", discount: 150 }, error: null });
    render(page());
    fireEvent.change(screen.getByRole("textbox", { name: "Email" }), { target: { value: "shopper@example.com" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Discount code" }), { target: { value: "MARU150" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Apply" })); });
    const format = (amount: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(amount).replace(/\s/g, " ");
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent(format(1549));
    expect(screen.getByText("Shipping").nextElementSibling).toHaveTextContent(format(99));
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText("Shipping").nextElementSibling).toHaveTextContent("Free");
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent(format(1600));
  });

  it.each([false, true])("does not place an order without loaded shipping rates (error: %s)", (isError) => {
    mocks.useShippingPolicy.mockReturnValue({ data: undefined, isError, refetch: vi.fn() });
    render(page());
    expect(screen.getByRole("button", { name: "Pay securely with PayFast" })).toBeDisabled();
    submitCheckout();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.getByText("Total").nextElementSibling).toHaveTextContent("—");
    if (isError) expect(screen.getByRole("button", { name: "Retry shipping rates" })).toBeInTheDocument();
  });

  it.each(["order", "payment"])("returns to checkout without clearing the cart when %s preparation fails", async (stage) => {
    mocks.rpc.mockResolvedValue(stage === "order"
      ? { data: null, error: { message: "Order unavailable" } }
      : { data: { id: "order-1" }, error: null });
    mocks.invoke.mockResolvedValue({ data: null, error: new Error("unavailable") });
    render(page());
    await act(async () => { submitCheckout(); });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(stage === "order" ? "Order unavailable" : "couldn't connect to PayFast");
    expect(screen.getByRole("button", { name: "Pay securely with PayFast" })).toBeEnabled();
    expect(mocks.clearCart).not.toHaveBeenCalled();
  });
});
