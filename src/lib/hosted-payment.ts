export interface HostedPaymentAdapter {
  open(url: string): void;
}

const DEFAULT_PAYMENT_HOSTS = new Set([
  "api.hdpayadmin.com",
  "c.gmobvfxllc.com",
]);

export function validateHostedPaymentUrl(raw: string): string | null {
  try {
    const value = new URL(raw);
    const host = value.hostname.toLowerCase();
    if (value.protocol !== "https:" || value.username || value.password || value.hash) return null;
    if (!host || !DEFAULT_PAYMENT_HOSTS.has(host) || host.includes(":")) return null;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return null;
    if (value.port && value.port !== "443") return null;
    return value.toString();
  } catch {
    return null;
  }
}

export function findResumablePaymentIntent<T extends {
  status: "awaiting_payment" | "mismatch_review" | string;
}>(intents: T[]): T | undefined {
  return intents.find((item) => item.status === "awaiting_payment" || item.status === "mismatch_review");
}

export function openHostedPaymentPage(
  raw: string,
  adapter: HostedPaymentAdapter = defaultAdapter(),
): boolean {
  const url = validateHostedPaymentUrl(raw);
  if (!url) return false;
  try {
    adapter.open(url);
    return true;
  } catch {
    return false;
  }
}

function defaultAdapter(): HostedPaymentAdapter {
  return {
    open: (url: string) => {
      const runtime = globalThis as unknown as {
        plus?: { runtime?: { openURL?: (target: string) => void } };
        location?: { assign?: (target: string) => void };
      };
      if (typeof runtime.plus?.runtime?.openURL === "function") {
        runtime.plus.runtime.openURL(url);
        return;
      }
      if (typeof runtime.location?.assign === "function") {
        runtime.location.assign(url);
        return;
      }
      throw new Error("HOSTED_PAYMENT_RUNTIME_UNAVAILABLE");
    },
  };
}
