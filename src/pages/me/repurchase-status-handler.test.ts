import page from "./wallet-repurchase.vue?raw";
import { describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const remoteBranch = page.slice(page.indexOf("async function handleRepurchase()"), page.indexOf("  if (isSandboxHold.value)", page.indexOf("async function handleRepurchase()")));
const createHandler = new Function("scope", `const { isRemote, isMounted, recovering, confirming, repurchase, accountGeneration, currentScope, w, toast } = scope; return (${remoteBranch}\n});`);

describe("actual repurchase page recovery handler", () => {
  it.each([en, zh, vietnamese])("uses distinct terminal/unknown feedback without confirming or posting", async (messages) => {
    for (const status of ["FAILED", "SUCCEEDED", "UNKNOWN", "PROCESSING", "NOT_FOUND", "MISMATCH"]) {
      const repurchase = { submitting: false, checkPendingOpen: vi.fn().mockResolvedValue(status), open: vi.fn() };
      const toast = { error: vi.fn(), success: vi.fn() };
      const handler = createHandler({ isRemote: { value: true }, isMounted: { value: true },
        recovering: { value: true }, confirming: { value: false }, repurchase,
        accountGeneration: 1, currentScope: () => true, w: { value: messages.repurchase }, toast });
      await handler();
      expect(repurchase.checkPendingOpen).toHaveBeenCalledTimes(1);
      expect(repurchase.open).not.toHaveBeenCalled();
      if (status === "FAILED") expect(toast.error).toHaveBeenCalledWith(messages.repurchase.recoveryFailedTitle, messages.repurchase.recoveryFailedBody);
      else if (status === "SUCCEEDED") expect(toast.success).toHaveBeenCalledWith(messages.repurchase.recoveryConfirmedTitle, messages.repurchase.recoveryConfirmedBody);
      else expect(toast.error).toHaveBeenCalledWith(messages.repurchase.recoveryPendingTitle, messages.repurchase.recoveryHint);
    }
  });

  it("keeps read failures pending and suppresses feedback after scope changes", async () => {
    const repurchase = { submitting: false, checkPendingOpen: vi.fn().mockRejectedValue(new Error("offline")), open: vi.fn() };
    const toast = { error: vi.fn(), success: vi.fn() };
    const scope = { isRemote: { value: true }, isMounted: { value: true }, recovering: { value: true },
      confirming: { value: false }, repurchase, accountGeneration: 1, currentScope: () => true,
      w: { value: en.repurchase }, toast };
    await createHandler(scope)();
    expect(toast.error).toHaveBeenCalledWith(en.repurchase.recoveryPendingTitle, en.repurchase.recoveryHint);
    toast.error.mockClear();
    await createHandler({ ...scope, currentScope: () => false })();
    expect(toast.error).not.toHaveBeenCalled();
    expect(repurchase.open).not.toHaveBeenCalled();
  });
});
