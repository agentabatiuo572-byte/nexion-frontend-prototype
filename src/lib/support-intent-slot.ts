import { sha256 } from "js-sha256";

/** Stable, opaque storage key for a retryable support command. */
export function opaqueSupportIntentSlot(intent: string): string {
  // TextEncoder replaces lone surrogates; keep existing pending slots stable.
  const wellFormed = Array.from(intent, char => {
    const code = char.charCodeAt(0);
    return char.length === 1 && code >= 0xd800 && code <= 0xdfff ? "\ufffd" : char;
  }).join("");
  return `sha256:${sha256(wellFormed)}`;
}
