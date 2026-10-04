import { afterEach, expect, it, vi } from "vitest";
import { createUniHttpTransport } from "./api-client";

afterEach(() => vi.unstubAllGlobals());
it.each([["request:fail timeout", "REQUEST_TIMEOUT"], ["request:fail network", "NETWORK_UNAVAILABLE"]])(
  "preserves an actionable %s category", async (errMsg, message) => {
    vi.stubGlobal("uni", { request: (options: any) => { options.fail({ errMsg }); return {}; } });
    await expect(createUniHttpTransport().request({ method: "POST", url: "http://localhost/chat",
      headers: {}, timeoutMs: 100 })).rejects.toMatchObject({ kind: "network", message });
  },
);
