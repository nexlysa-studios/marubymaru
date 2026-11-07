import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminOrders from "@/pages/admin/AdminOrders";
import AdminOrderDetail from "@/pages/admin/AdminOrderDetail";
import AdminOverview from "@/pages/admin/AdminOverview";
import PaymentStatusBadge from "@/components/admin/PaymentStatusBadge";
import { paymentStatus, paymentSummary } from "@/lib/adminPayments";
import type { AdminOrder } from "@/hooks/useAdminOrders";

const mocks = vi.hoisted(() => ({ orders: vi.fn(), order: vi.fn(), refresh: vi.fn(), update: vi.fn(), eq: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/useAdminOrders", () => ({ adminOrdersQueryKey: ["admin", "orders"], useAdminOrders: mocks.orders, useAdminOrder: mocks.order }));
vi.mock("@/hooks/useAdminProducts", () => ({ useAdminProducts: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => ({ data: [], isLoading: false }) }));
vi.mock("@/context/AdminAuthContext", () => ({ useAdminAuth: () => ({ user: { email: "admin@example.invalid" } }) }));
vi.mock("@/components/admin/OrderEmailStatus", () => ({ default: ({ paid }: { paid: boolean }) => <p>Email payment flag: {String(paid)}</p> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ update: mocks.update }) } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.toast } }));

const order = (payment: string, overrides: Partial<AdminOrder> = {}): AdminOrder => ({
  id: `order-${payment}`, order_number: `MBM-${payment.toUpperCase()}`, payment_status: payment,
  status: "new", total: 749, subtotal: 650, shipping_amount: 99, discount_amount: 0, discount_code: "",
  customer_first_name: "Test", customer_last_name: "Customer", customer_email: `${payment}@example.invalid`, customer_phone: "0000000000",
  shipping_address_line_1: "Test road", shipping_address_line_2: "", shipping_city: "Cape Town", shipping_province: "Western Cape",
  shipping_country: "South Africa", shipping_postal_code: "8001", customer_notes: "", admin_notes: "Saved notes",
  created_at: "2026-10-09T12:00:00Z", updated_at: "2026-10-09T12:00:00Z",
  payment_reference: payment === "paid" ? "123456789" : "", paid_at: payment === "paid" ? "2026-10-09T12:05:00Z" : null,
  ...overrides,
});
const format = (n: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n).replace(/\s/g, " ");
const queryResult = (data: unknown) => ({ data, isLoading: false, isFetching: false, error: null, refetch: mocks.refresh, dataUpdatedAt: Date.parse("2026-10-09T12:10:00Z") });
function mount(page: React.ReactNode, path = "/admin/orders") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/admin/orders/:id" element={page} /><Route path="*" element={page} /></Routes>
  </MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.orders.mockReturnValue(queryResult([order("paid", { status: "confirmed" }), order("pending"), order("failed"), order("cancelled")]));
  mocks.order.mockReturnValue(queryResult({ order: order("paid"), items: [] }));
  mocks.update.mockReturnValue({ eq: mocks.eq });
  mocks.eq.mockResolvedValue({ error: null });
});
afterEach(cleanup);

describe("payment insights", () => {
  it("counts actual payment statuses and excludes unpaid orders from received totals", () => {
    const summary = paymentSummary([order("paid", { total: 1500, status: "cancelled" }), order("pending", { total: 749 }), order("failed"), order("cancelled"), order("unexpected")]);
    expect(summary).toEqual({ counts: { paid: 1, pending: 1, failed: 1, cancelled: 1, unknown: 1 }, paidTotal: 1500, pendingTotal: 749 });
  });
  it("adds amounts in cents without float drift", () => {
    expect(paymentSummary([order("paid", { total: 0.1 }), order("paid", { total: 0.2 })]).paidTotal).toBe(0.3);
  });
  it.each([null, undefined, "", "unexpected"])("does not invent pending or paid status for %s", (value) => {
    expect(paymentStatus(value)).toBe("unknown");
    render(<PaymentStatusBadge status={value} />);
    expect(screen.getByLabelText("Payment: Unknown")).toHaveTextContent("Unknown");
  });
});

describe("admin order payment list", () => {
  it("shows payment badges independently from fulfilment", () => {
    mount(<AdminOrders />);
    const row = screen.getByRole("link", { name: /MBM-PAID/ });
    expect(within(row).getByLabelText("Payment: Paid")).toBeInTheDocument();
    expect(within(row).getByLabelText("Fulfilment: confirmed")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Payment overview" })).getByText(`${format(749)} confirmed`)).toBeInTheDocument();
  });
  it("combines payment, fulfilment and search filters", () => {
    mount(<AdminOrders />);
    fireEvent.change(screen.getByRole("combobox", { name: "Payment status" }), { target: { value: "paid" } });
    expect(screen.getByRole("link", { name: /MBM-PAID/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /MBM-PENDING/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "new" }));
    expect(screen.getByText("No orders found")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "all" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search orders" }), { target: { value: "123456789" } });
    expect(screen.getByRole("link", { name: /MBM-PAID/ })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search orders" }), { target: { value: "no-match" } });
    expect(screen.getByText("No orders found")).toBeInTheDocument();
  });
  it("supports dashboard payment links and direct filtered URLs", () => {
    mount(<AdminOrders />, "/admin/orders?payment=pending");
    expect(screen.getByRole("combobox", { name: "Payment status" })).toHaveValue("pending");
    expect(screen.getByRole("link", { name: /MBM-PENDING/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /MBM-PAID/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "View failed payments" }));
    expect(screen.getByRole("combobox", { name: "Payment status" })).toHaveValue("failed");
    expect(screen.getByRole("link", { name: /MBM-FAILED/ })).toBeInTheDocument();
  });
  it("refreshes the admin data without a payment write", () => {
    mount(<AdminOrders />);
    fireEvent.click(screen.getByRole("button", { name: "Refresh orders" }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("admin order payment detail", () => {
  it("shows the confirmed amount, reference and SAST payment date", () => {
    mount(<AdminOrderDetail />, "/admin/orders/order-paid");
    const panel = screen.getByRole("region", { name: "Payment details" });
    expect(within(panel).getByLabelText("Payment: Paid")).toBeInTheDocument();
    expect(within(panel).getByText("123456789")).toBeInTheDocument();
    expect(within(panel).getByText(/14:05 SAST/)).toBeInTheDocument();
    expect(within(panel).getByText(format(749))).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /Payment/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh payment status" }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it("explains pending/abandoned checkouts without inventing receipt data", () => {
    mocks.order.mockReturnValue(queryResult({ order: order("pending"), items: [] }));
    mount(<AdminOrderDetail />, "/admin/orders/order-pending");
    const panel = screen.getByRole("region", { name: "Payment details" });
    expect(within(panel).getByText(/abandoned or cancelled checkouts/)).toBeInTheDocument();
    expect(within(panel).getByText("Not received")).toBeInTheDocument();
    expect(within(panel).getByText("Not confirmed")).toBeInTheDocument();
    expect(screen.getByText("Email payment flag: false")).toBeInTheDocument();
  });
  it("keeps unsaved fulfilment and private notes when payment data refreshes", () => {
    mocks.order.mockReturnValue(queryResult({ order: order("pending"), items: [] }));
    const view = mount(<AdminOrderDetail />, "/admin/orders/order-pending");
    fireEvent.change(screen.getByRole("combobox", { name: "Fulfilment status" }), { target: { value: "processing" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Private admin notes" }), { target: { value: "Draft tracking note" } });
    mocks.order.mockReturnValue(queryResult({ order: order("paid", { id: "order-pending", status: "confirmed" }), items: [] }));
    view.rerender(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/admin/orders/order-pending"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/admin/orders/:id" element={<AdminOrderDetail />} /></Routes></MemoryRouter></QueryClientProvider>);
    expect(screen.getByRole("combobox", { name: "Fulfilment status" })).toHaveValue("processing");
    expect(screen.getByRole("textbox", { name: "Private admin notes" })).toHaveValue("Draft tracking note");
    expect(within(screen.getByRole("region", { name: "Payment details" })).getByLabelText("Payment: Paid")).toBeInTheDocument();
  });
  it("only saves fulfilment and notes, never payment fields", async () => {
    mount(<AdminOrderDetail />, "/admin/orders/order-paid");
    fireEvent.change(screen.getByRole("combobox", { name: "Fulfilment status" }), { target: { value: "processing" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Private admin notes" }), { target: { value: "  Packed  " } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Save changes" })); });
    expect(mocks.update).toHaveBeenCalledWith({ status: "processing", admin_notes: "Packed" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "order-paid");
  });
  it("shows a stale-data warning rather than hiding existing details on refresh failure", () => {
    mocks.order.mockReturnValue({ ...queryResult({ order: order("pending"), items: [] }), error: new Error("offline") });
    mount(<AdminOrderDetail />, "/admin/orders/order-pending");
    expect(screen.getByRole("alert")).toHaveTextContent("may be out of date");
    expect(screen.getByRole("region", { name: "Payment details" })).toBeInTheDocument();
  });
});

describe("dashboard payment view", () => {
  it("reports verified paid totals instead of the value of unpaid orders", () => {
    mount(<AdminOverview />, "/admin");
    const summary = screen.getByRole("region", { name: "Business summary" });
    expect(within(summary).getByText("Payments received").parentElement?.nextElementSibling).toHaveTextContent(format(749));
    expect(within(summary).getByText("1 PayFast-confirmed order · includes shipping")).toBeInTheDocument();
    const snapshot = screen.getByRole("region", { name: "Payment snapshot" });
    expect(within(snapshot).getByRole("link", { name: /Pending/ })).toHaveAttribute("href", "/admin/orders?payment=pending");
  });
});
