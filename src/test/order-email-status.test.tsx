import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import OrderEmailStatus from "@/components/admin/OrderEmailStatus";

const result = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: result }) }) }) } }));
afterEach(cleanup);
function mount(paid = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><OrderEmailStatus orderId="order-test" paid={paid} /></QueryClientProvider>);
}
describe("admin email tracking", () => {
  it("distinguishes accepted emails from delivered emails", async () => {
    result.mockResolvedValue({ data: [
      { id: "1", kind: "customer_payment", status: "sent", recipient: "buyer@example.com", delivery_status: null },
      { id: "2", kind: "admin_payment", status: "sent", recipient: "orders@example.com", delivery_status: "delivered" },
    ], error: null });
    mount();
    expect(await screen.findByText("Sent")).toBeInTheDocument();
    expect(screen.getByText("Delivered")).toBeInTheDocument();
    expect(screen.getByText("Customer confirmation")).toBeInTheDocument();
    expect(screen.getByText("Admin notification")).toBeInTheDocument();
  });
  it("shows failures separately from payment state", async () => {
    result.mockResolvedValue({ data: [{ id: "1", kind: "customer_payment", status: "sent", delivery_status: "bounced" }], error: null });
    mount();
    expect(await screen.findByText("Bounced")).toBeInTheDocument();
    expect(screen.getByText(/Payment status is unaffected/)).toBeInTheDocument();
  });
  it("explains why unpaid orders have no messages", async () => {
    result.mockResolvedValue({ data: [], error: null });
    mount(false);
    expect(await screen.findByText(/queued only after PayFast confirms payment/)).toBeInTheDocument();
  });
});
