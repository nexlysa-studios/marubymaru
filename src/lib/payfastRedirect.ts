export function redirectToPayFast(value: unknown) {
  if (!value || typeof value !== "object") throw new Error("Invalid payment response");
  const checkout = value as { action?: unknown; fields?: unknown };
  if (checkout.action !== "https://www.payfast.co.za/eng/process" && checkout.action !== "https://sandbox.payfast.co.za/eng/process") throw new Error("Invalid payment gateway");
  if (!checkout.fields || typeof checkout.fields !== "object" || Array.isArray(checkout.fields)) throw new Error("Invalid payment fields");
  const entries = Object.entries(checkout.fields);
  if (!entries.length || entries.some(([name, field]) => !/^[a-zA-Z0-9_]+$/.test(name) || typeof field !== "string")) throw new Error("Invalid payment fields");
  const form = document.createElement("form");
  form.method = "POST";
  form.action = checkout.action;
  form.hidden = true;
  for (const [name, value] of entries) {
    const input = document.createElement("input"); input.type = "hidden"; input.name = name; input.value = String(value); form.appendChild(input);
  }
  document.body.appendChild(form);
  try { form.submit(); } catch (error) { form.remove(); throw error; }
}
