/** Never hash a server primary key into a smaller client-side identity space. */
export function genesisHoldingId(value: string): string {
  if (!/^[A-Za-z0-9-]{3,128}$/.test(value)) throw new Error("GENESIS_HOLDING_ID_INVALID");
  return value;
}

/** Presentation only: all actions and keys retain the complete server identity. */
export function displayGenesisHoldingId(value: string | number): string {
  const text = String(value);
  return text.length > 18 ? `${text.slice(0, 8)}…${text.slice(-6)}` : text;
}
