import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewsletterSection from "@/components/storefront/NewsletterSection";
import NewsletterUnsubscribe from "@/pages/NewsletterUnsubscribe";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke } } }));
beforeEach(() => { invoke.mockReset(); });
afterEach(cleanup);
const mount = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><NewsletterSection /></MemoryRouter>);
const submit = () => fireEvent.submit(screen.getByRole("button", { name: "Join" }).closest("form")!);
describe("immediate newsletter signup", () => {
  it("requires explicit consent", () => {
    mount(); fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.test" } }); submit();
    expect(invoke).not.toHaveBeenCalled();
  });
  it("subscribes immediately without a verification flow", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null }); mount();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.test" } });
    fireEvent.click(screen.getByRole("checkbox")); await act(async () => { submit(); });
    expect(invoke).toHaveBeenCalledWith("newsletter", { body: { email: "reader@example.test", consent: true, website: "" } });
    expect(screen.getByRole("dialog")).toHaveTextContent("A little closer");
    expect(screen.getByRole("dialog")).toHaveTextContent("No email verification is needed");
    expect(screen.getByRole("dialog")).toHaveTextContent("welcome confirmation is on its way");
    fireEvent.click(screen.getByRole("button", { name: "Continue browsing" }));
    expect(screen.getByLabelText("Email address")).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("no verification needed");
  });
  it("shows an explicit duplicate warning without opening a success popup", async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ code: "already_subscribed" }), { status: 409 }) } });
    mount(); fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "READER@example.test" } });
    fireEvent.click(screen.getByRole("checkbox")); await act(async () => { submit(); });
    expect(screen.getByRole("status")).toHaveTextContent("already on the Maru List");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toHaveValue("READER@example.test");
  });
  it("does not silently resubscribe a previously unsubscribed address", async () => {
    invoke.mockResolvedValue({ data: null, error: { context: new Response(JSON.stringify({ code: "unavailable" }), { status: 409 }) } });
    mount(); fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.test" } });
    fireEvent.click(screen.getByRole("checkbox")); await act(async () => { submit(); });
    expect(screen.getByRole("status")).toHaveTextContent("Contact marubymaru@icloud.com");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("retains the email on failure and allows retry", async () => {
    invoke.mockResolvedValue({ error: new Error("network") }); mount();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "reader@example.test" } });
    fireEvent.click(screen.getByRole("checkbox")); await act(async () => { submit(); });
    expect(screen.getByRole("status")).toHaveTextContent("couldn't save");
    expect(screen.getByLabelText("Email address")).toHaveValue("reader@example.test");
  });
});
describe("newsletter unsubscribe", () => {
  it("does not change consent just by opening the page", async () => {
    render(<MemoryRouter initialEntries={["/newsletter/unsubscribe?token=628c0721-bd00-4000-8000-000000000001"]}><NewsletterUnsubscribe /></MemoryRouter>);
    expect(invoke).not.toHaveBeenCalled(); invoke.mockResolvedValue({ data: "ok", error: null });
    expect(screen.getByText(/You'll stop receiving our sale announcements/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Keep me on the list" })).toHaveAttribute("href", "/shop");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Yes, unsubscribe" })); });
    expect(invoke).toHaveBeenCalledWith(expect.stringContaining("newsletter?action=unsubscribe&token="), { body: {} });
    expect(screen.getByRole("heading")).toHaveTextContent("unsubscribed");
    expect(screen.getByText(/Essential order confirmations are unaffected/)).toBeInTheDocument();
  });
  it("rejects missing tokens", () => {
    render(<MemoryRouter><NewsletterUnsubscribe /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Yes, unsubscribe" })).not.toBeInTheDocument(); expect(invoke).not.toHaveBeenCalled();
  });
});
