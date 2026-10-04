/** Keeps a valid partial decimal while the user is still editing it. */
export function sanitizeExchangeAmountInput(value: string): string {
  const digitsAndDecimal = value.replace(/[^0-9.]/g, "");
  const [integer = "", ...fractionParts] = digitsAndDecimal.split(".");
  return fractionParts.length === 0 ? integer : integer + "." + fractionParts.join("");
}

/** Applies the two-decimal ledger precision only when editing has finished. */
export function canonicalExchangeAmount(value: string): string {
  const sanitized = sanitizeExchangeAmountInput(value);
  if (!sanitized || sanitized === ".") return "";
  const [wholeText = "", fractionText = ""] = sanitized.split(".");
  if (!/^\d*$/.test(wholeText) || !/^\d*$/.test(fractionText)) return "";

  const cents = fractionText.slice(0, 2).padEnd(2, "0");
  const thousandth = fractionText.charAt(2);
  let units = BigInt((wholeText || "0") + cents);
  if (thousandth >= "5") units += 1n;

  const whole = units / 100n;
  const fraction = (units % 100n).toString().padStart(2, "0").replace(/0$/, "");
  return fraction ? whole.toString() + "." + fraction : whole.toString();
}
