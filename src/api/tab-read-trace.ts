import type { HttpTransport } from "./api-client";

/** Temporary TEST measurement only; production mode always removes this branch. */
export function withTabReadTrace(transport: HttpTransport): HttpTransport {
  if (import.meta.env.MODE !== "development" || import.meta.env.VITE_NEXGRID_TAB_READ_TRACE !== "1") return transport;
  let sequence = 0;
  const started = typeof performance !== "undefined" ? performance.now() : Date.now();
  return { ...transport, request(request) {
    const path = request.url.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0];
    const current = typeof performance !== "undefined" ? performance.now() : Date.now();
    console.info("[tab-read]", JSON.stringify({ sequence: ++sequence, elapsedMs: Math.max(0, Math.round(current - started)),
      method: request.method, path }));
    return transport.request(request);
  } };
}
