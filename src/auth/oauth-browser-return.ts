export interface OAuthBrowserReceipt { flowId: string; receipt: string }
let listener: ((receipt: OAuthBrowserReceipt) => void) | undefined;

export function validOAuthBrowserReceipt(value: unknown): value is OAuthBrowserReceipt {
  const receipt = value as OAuthBrowserReceipt;
  return !!receipt && /^OIDC-[a-f0-9]{32}$/.test(receipt.flowId)
    && /^[A-Za-z0-9_-]{43}$/.test(receipt.receipt);
}
export function listenForNativeOAuthReturn(callback: (receipt: OAuthBrowserReceipt) => void) {
  listener = callback;
  return () => { if (listener === callback) listener = undefined; };
}
export function acceptNativeOAuthReturn(raw: string) {
  // The backend emits this exact URI; native service JS need not supply URL.
  const match = /^uvel:\/\/oauth\?flowId=(OIDC-[a-f0-9]{32})&receipt=([A-Za-z0-9_-]{43})$/.exec(raw);
  if (match) listener?.({ flowId: match[1], receipt: match[2] });
}
