import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import Footer from "@/components/Footer";
import PaymentMethods from "@/components/PaymentMethods";

afterEach(cleanup);

describe("payment method display", () => {
  it("shows all supplied payment brands with the requested secure-payment label", () => {
    render(<PaymentMethods />);

    expect(screen.getByText("Pay securely with")).toBeInTheDocument();
    for (const brand of ["Visa", "Mastercard", "Apple Pay", "Google Pay", "PayFast"]) {
      expect(screen.getByRole("img", { name: brand })).toBeInTheDocument();
    }
  });

  it("includes the payment methods in the site footer", () => {
    render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Footer /></MemoryRouter>);
    expect(screen.getByRole("region", { name: "Accepted payment methods" })).toBeInTheDocument();
    expect(screen.getByText("Pay securely with")).toBeInTheDocument();
  });
});
