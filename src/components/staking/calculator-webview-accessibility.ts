type NamedInput = { getAttribute(name: string): string | null; setAttribute(name: string, value: string): void };
type Radio = { click(): void; focus(): void };

export function syncAmountName(card: { querySelector(selector: string): NamedInput | null } | null, label?: string): boolean {
  const input = card?.querySelector("uni-input .uni-input-input");
  const name = label || card?.querySelector("uni-input")?.getAttribute("aria-label");
  if (input && name && input.getAttribute("aria-label") !== name) input.setAttribute("aria-label", name);
  return !!input;
}

export function moveCalculatorRadio(
  card: { contains(node: unknown): boolean; querySelectorAll(selector: string): ArrayLike<Radio> },
  event: {
    key: string;
    target: { closest(selector: string): Radio | null };
    preventDefault(): void;
    stopPropagation(): void;
  },
): void {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const radio = event.target.closest('[role="radio"]');
  if (!radio || !card.contains(radio)) return;
  const radios = Array.from(card.querySelectorAll('[role="radiogroup"] [role="radio"]'));
  const at = radios.indexOf(radio);
  if (at < 0 || radios.length < 2) return;
  event.preventDefault();
  event.stopPropagation();
  const next = radios[(at + (event.key === "ArrowRight" ? 1 : -1) + radios.length) % radios.length];
  next.click();
  next.focus();
}
