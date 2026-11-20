import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PaymentRecovery from "@/pages/PaymentRecovery";
import { redirectToPayFast } from "@/lib/payfastRedirect";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
const token = "628c0721-bd00-4000-8000-000000000001";
const order = (state = "pending") => ({ order_id: token, order_number: "MBM-TEST", total: 749, payment_status: state, can_pay: state === "pending" });
const mount = (mode = "", query = `token=${token}`) => render(<MemoryRouter initialEntries={[`/payment/reminder?${query}${mode}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PaymentRecovery /></MemoryRouter>);
beforeEach(() => { invoke.mockReset(); vi.spyOn(window, "scrollTo").mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); document.querySelectorAll('form[action*="payfast.co.za"]').forEach(form => form.remove()); });
describe("secure payment reminder page", () => {
  it("only reads status on entry, even when the email link says cancel", async () => {
    invoke.mockResolvedValue({ data: order(), error: null }); await act(async () => { mount("&mode=cancel"); });
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith("payment-recovery", expect.objectContaining({ body: { action: "status", token } }));
    expect(screen.getByRole("button", { name: "Yes, cancel this order" })).toBeInTheDocument();
  });
  it("resumes the existing DB order using a signed POST form", async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    invoke.mockResolvedValueOnce({ data: order(), error: null }).mockResolvedValueOnce({ data: { ...order(), checkout: { action: "https://www.payfast.co.za/eng/process", fields: { amount: "749.00", m_payment_id: token } } }, error: null });
    await act(async () => { mount(); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Pay now with PayFast" })); });
    expect(invoke).toHaveBeenLastCalledWith("payment-recovery", expect.objectContaining({ body: { action: "start", token } }));
    expect(submit).toHaveBeenCalledOnce();
    expect(document.querySelector('form input[name="amount"]')).toHaveValue("749.00");
    expect(screen.getByRole("heading", { name: "Redirecting you to PayFast…" })).toHaveFocus();
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: "instant" });
  });
  it("requires an explicit click to cancel and shows the confirmed result", async () => {
    invoke.mockResolvedValueOnce({ data: order(), error: null }).mockResolvedValueOnce({ data: order("cancelled"), error: null });
    await act(async () => { mount("&mode=cancel"); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Yes, cancel this order" })); });
    expect(invoke).toHaveBeenLastCalledWith("payment-recovery", expect.objectContaining({ body: { action: "cancel", token } }));
    expect(screen.getByRole("heading", { name: "Your order is cancelled." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pay with PayFast/i })).not.toBeInTheDocument();
  });
  it("never starts another payment after the DB reports paid", async () => {
    invoke.mockResolvedValue({ data: order("paid"), error: null }); await act(async () => { mount(); });
    expect(screen.getByRole("heading", { name: "Your payment is confirmed." })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pay now with PayFast" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View confirmation" })).toHaveAttribute("href", `/payment/success?order=${token}`);
  });
  it("honours a payment confirmation arriving between status and a cancellation click", async () => {
    invoke.mockResolvedValueOnce({ data: order(), error: null }).mockResolvedValueOnce({ data: order("paid"), error: null });
    await act(async () => { mount("&mode=cancel"); });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Yes, cancel this order" })); });
    expect(screen.getByRole("heading", { name: "Your payment is confirmed." })).toBeInTheDocument();
  });
  it("does not expose pay/cancel actions for expired links", async () => {
    invoke.mockResolvedValue({ data: { error: "This payment link has expired.", code: "expired" }, error: null });
    await act(async () => { mount(); }); expect(screen.getByRole("alert")).toHaveTextContent("expired");
    expect(screen.queryByRole("button", { name: "Pay now with PayFast" })).not.toBeInTheDocument();
  });
  it("rejects missing tokens without calling the backend", async () => {
    await act(async () => { mount("", ""); }); expect(invoke).not.toHaveBeenCalled(); expect(screen.getByRole("alert")).toHaveTextContent("invalid");
  });
  it("offers recovery after a network error instead of submitting to another gateway", async () => {
    invoke.mockResolvedValueOnce({ data: order(), error: null }).mockResolvedValueOnce({ data: null, error: new Error("offline") });
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {});
    await act(async () => { mount(); }); await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Pay now with PayFast" })); });
    expect(screen.getByRole("alert")).toHaveTextContent("couldn't update"); expect(submit).not.toHaveBeenCalled();
  });
});
describe("payment handoff restrictions", () => {
  it("refuses an untrusted gateway or malformed fields", () => {
    expect(() => redirectToPayFast({ action: "https://other.example/pay", fields: { amount: "749.00" } })).toThrow("gateway");
    expect(() => redirectToPayFast({ action: "https://www.payfast.co.za/eng/process", fields: { amount: 749 } })).toThrow("fields");
  });
});
