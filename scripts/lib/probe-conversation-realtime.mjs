import { randomUUID } from "node:crypto";

/** Isolate the background M3 transport without inventing business-command receipts. */
export async function installProbeConversationRealtime(page, { authenticated = true } = {}) {
  const tickets = new Set();
  await page.route((url) => url.pathname === "/api/app/support/realtime-ticket", async (route) => {
    const allowed = authenticated && route.request().method() === "POST";
    const ticket = allowed ? `probe-realtime-${randomUUID()}` : null;
    if (ticket) tickets.add(ticket);
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(allowed
        ? { code: 0, message: "OK", data: { ticket } }
        : { code: 401, message: "AUTH_REQUIRED", data: null }),
    });
  });
  // Exact path matching leaves Vite HMR and unrelated WebSockets untouched.
  await page.routeWebSocket((url) => url.pathname === "/ws/conversations", (socket) => {
    let ready = false;
    socket.onMessage((message) => {
      let frame;
      try { frame = JSON.parse(String(message)); } catch { socket.close({ code: 1008, reason: "INVALID_FRAME" }); return; }
      if (!ready) {
        if (!authenticated || frame?.type !== "auth" || !tickets.delete(frame.ticket)) {
          socket.send(JSON.stringify({ type: "error", code: 401 }));
          socket.close({ code: 1008, reason: "AUTH_REQUIRED" });
          return;
        }
        ready = true;
        socket.send(JSON.stringify({ type: "ready" }));
        return;
      }
      if (frame?.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
      // watch/typing are ephemeral; business commands need their own explicit fixture.
      // In particular, never generate a success ACK for a write this probe did not model.
    });
  });
}

export function probeConversationReadFixture(url, request) {
  if (request.method() !== "GET") return undefined;
  if (url.pathname === "/api/app/support/conversations/cursor") return { records: [], total: 0, pageSize: 100 };
  if (url.pathname === "/api/app/support/conversation-dismissals") return [];
  return undefined;
}
