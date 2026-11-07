import { Link } from "react-router-dom";
import { useShippingPolicy } from "@/hooks/useShippingPolicy";
import { shippingDescription } from "@/lib/shipping";

// Reuses existing ProductDetail copy. Business owners should review these pages
// before launch; never add unconfirmed payment, delivery or legal promises here.
const pages = {
  shipping: {
    title: "Shipping & Delivery",
    intro: "From the Maru collection to your wardrobe.",
    sections: [
      ["Delivery", "Delivery takes 5–10 business days on all orders."],
      ["Shipping rates", ""],
      ["Your address", "Please provide a complete delivery address and contact number at checkout. Delivery arrangements will be confirmed with you after your order is placed."],
    ],
  },
  returns: {
    title: "Returns & Refunds",
    intro: "Taking care of your purchase.",
    sections: [
      ["Returns & Refunds", "We do not accept change-of-mind returns or exchanges unless otherwise stated. If you receive an incorrect, damaged or defective item, please contact us as soon as possible so that we can assist you in accordance with applicable South African consumer law."],
      ["Your rights", "Nothing in these terms limits your rights under applicable consumer legislation."],
    ],
  },
  "size-guide": {
    title: "Size Guide",
    intro: "Find the silhouette that feels like you.",
    sections: [
      ["Available sizes", "Select a piece to see its available sizes. Fabric and care details appear on each product page."],
      ["Fit guidance", "Garment measurements and a confirmed regional size conversion chart will be added here soon. Until then, fit can be confirmed with your order before payment arrangements are made."],
    ],
  },
  faq: {
    title: "Frequently Asked Questions",
    intro: "A few details to help you along the way.",
    sections: [
      ["How do I place an order?", "Choose your pieces and sizes, add them to your cart, then select Place Your Order. Enter your contact and delivery details and submit. Your order reference will appear on the confirmation screen."],
      ["Do I need an account?", "You can place an order as a guest. No customer account is required."],
      ["When do I pay?", "Checkout takes you to PayFast to pay securely. Your order is confirmed after PayFast verifies successful payment."],
      ["How much is shipping?", ""],
      ["Will my cart be saved?", "Your current cart lasts while you browse. Refreshing or closing the page clears it."],
    ],
  },
  privacy: {
    title: "Privacy Policy",
    intro: "Your information deserves thoughtful care.",
    sections: [
      ["Order information", "Checkout asks for your name, email, phone number, delivery address and any order notes. These details are saved with your order so the Maru team can manage it."],
      ["Full policy", "Our full privacy policy and privacy contact details are being prepared. They will be published here once confirmed."],
    ],
  },
  terms: {
    title: "Terms & Conditions",
    intro: "By placing an order with Maru by Maru, you agree to the following terms and conditions.",
    sections: [
      ["Orders", "All orders are subject to availability. Once payment has been received, your order will be processed. Please ensure that your contact and delivery details, size and colour selection are correct before placing your order."],
      ["Payment", "All prices are displayed in South African Rand (ZAR). Orders are only confirmed once payment has been successfully received."],
      ["Delivery & Collection", "We deliver across South Africa. Delivery times may vary depending on the courier and destination. Maru by Maru is not responsible for delays caused by third-party courier services. Collection is available where stated and collection details will be provided once your order is ready."],
      ["Returns & Refunds", "We do not accept change-of-mind returns or exchanges unless otherwise stated. If you receive an incorrect, damaged or defective item, please contact us as soon as possible so that we can assist you in accordance with applicable South African consumer law. Nothing in these terms limits your rights under applicable consumer legislation."],
      ["Sale Items", "Sale and promotional items may be subject to specific terms. All statutory consumer rights still apply."],
      ["Product Images", "We do our best to display our products accurately. Colours may vary slightly due to lighting and individual screen settings."],
      ["Website & Content", "All images, designs, logos, product names and content on the Maru by Maru website belong to Maru by Maru and may not be used or reproduced without permission."],
      ["Changes", "Maru by Maru reserves the right to update these Terms & Conditions at any time. Updated terms will be published on this page."],
      ["Contact", "For any questions regarding your order, please contact us on 076 911 2141, email marubymaru@icloud.com, or connect with us on Instagram @marubymaruu and TikTok @marubymaruu. Maru by Maru | South Africa | marubymaru.co.za"],
    ],
  },
};

export type InformationPage = keyof typeof pages;

export default function StoreInformation({ page }: { page: InformationPage }) {
  const content = pages[page];
  const { data: shippingPolicy, isError: shippingError } = useShippingPolicy();
  return (
    <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 md:py-24">
      <p className="mb-4 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Maru by Maru</p>
      <h1 className="font-serif text-4xl leading-tight md:text-5xl">{content.title}</h1>
      <p className="mt-5 text-sm leading-relaxed text-muted-foreground">{content.intro}</p>
      <div className="mt-12 space-y-8 border-t border-black/10 pt-10">
        {content.sections.map(([title, text]) => <section key={title}>
          <h2 className="font-serif text-2xl">{title}</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">{text || (shippingPolicy ? shippingDescription(shippingPolicy) : shippingError ? "Shipping rates are temporarily unavailable. Please check again at checkout." : "Loading shipping rates…")}</p>
        </section>)}
      </div>
      <div className="mt-12 flex flex-wrap gap-6 text-[10px] uppercase tracking-[0.2em]">
        <Link to="/shop" className="py-3 hover-underline">Explore the collection →</Link>
        {page !== "faq" && <Link to="/faq" className="py-3 hover-underline">Common questions →</Link>}
      </div>
    </div>
  );
}
