/** A poster is a public artifact: unknown data must never be serialized as `null`. */
export function proofPosterText(value: string | number | null | undefined): string {
  return value === null || value === undefined ? "—" : String(value);
}
