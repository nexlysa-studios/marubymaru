const paymentMethods = [
  { name: "Visa", src: "/payment-methods/visa.svg", className: "h-7 w-12" },
  { name: "Mastercard", src: "/payment-methods/mastercard.svg", className: "h-8 w-12" },
  { name: "Apple Pay", src: "/payment-methods/apple-pay.svg", className: "h-8 w-12" },
  { name: "Google Pay", src: "/payment-methods/google-pay.svg", className: "h-8 w-12" },
];

export default function PaymentMethods({ label = "Pay securely with" }: { label?: string }) {
  return (
    <section aria-label="Accepted payment methods">
      <p className="mb-3 text-[10px] uppercase tracking-[0.18em] text-black/55">{label}</p>
      <ul className="flex flex-wrap items-center gap-3" aria-label="Payment methods">
        {paymentMethods.map(({ name, src, className }) => (
          <li key={name}>
            <img src={src} alt={name} className={`${className} object-contain`} />
          </li>
        ))}
        <li className="flex h-8 w-16 items-center justify-center bg-black px-1" aria-label="PayFast">
          <img src="/payment-methods/payfast.svg" alt="PayFast" className="max-h-full max-w-full object-contain" />
        </li>
      </ul>
    </section>
  );
}
