import { describe, expect, it, vi } from "vitest";
import { opaqueSupportIntentSlot } from "./support-intent-slot";

describe("support intent slot", () => {
  it("keeps the prior SHA-256 key for multilingual retries without Web Crypto", () => {
    vi.stubGlobal("crypto", undefined);
    vi.stubGlobal("TextEncoder", undefined);
    try {
      for (const [intent, expected] of [
        ["conversation-create:support:NexGrid TEST 2026-09-26", "6b82de612d6b1a22c8ff5b84586e98f889208660c371c14f212cafa9e0534aa5"],
        ["ticket-create:hỗ trợ:测试 🧪", "049694da23c969268280d64f05478f02f949041eed459300dd097139209237ee"],
        ["bad:\ud800", "82e3d2d6e45ed3f05e7bde7b9c7932105efb4cdea3c37989b69e898fddb66b8e"],
      ]) {
        expect(opaqueSupportIntentSlot(intent)).toBe(`sha256:${expected}`);
      }
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
