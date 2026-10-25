/** Format validation only: a hash is not evidence of a confirmed transaction. */
export function validatedTransactionHash(value: unknown): string {
  if (typeof value !== "string") return "";
  const hash = value.trim();
  return /^(?:0x)?[a-fA-F0-9]{64}$/.test(hash) ? hash : "";
}
