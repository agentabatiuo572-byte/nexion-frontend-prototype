import { describe, expect, it, vi } from "vitest";
import { runConfirmedDeveloperMutation } from "./developer-resource-confirmation";

describe("developer resource confirmation", () => {
  it("does not send a destructive request when the confirmation is cancelled", async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    const request = vi.fn().mockResolvedValue("sent");

    await expect(runConfirmedDeveloperMutation(confirm, () => true, request)).resolves.toEqual({ confirmed: false });
    expect(request).not.toHaveBeenCalled();
  });

  it("sends exactly one request only after confirmation", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    const request = vi.fn().mockResolvedValue("sent");

    await expect(runConfirmedDeveloperMutation(confirm, () => true, request)).resolves.toEqual({ confirmed: true, value: "sent" });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not send after a deferred confirmation when the account epoch changes", async () => {
    let accountEpoch = 7;
    let runtimeRevision = 11;
    let resolveConfirmation!: (value: boolean) => void;
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => { resolveConfirmation = resolve; }));
    const captured = { accountEpoch, runtimeRevision };
    const isCurrent = vi.fn(() => captured.accountEpoch === accountEpoch && captured.runtimeRevision === runtimeRevision);
    const request = vi.fn().mockResolvedValue("sent");
    const action = runConfirmedDeveloperMutation(confirm, isCurrent, request);

    await Promise.resolve();
    accountEpoch += 1;
    resolveConfirmation(true);

    await expect(action).resolves.toEqual({ confirmed: false });
    expect(request).not.toHaveBeenCalled();
  });

  it("does not send after a deferred confirmation when the runtime revision changes", async () => {
    let accountEpoch = 7;
    let runtimeRevision = 11;
    let resolveConfirmation!: (value: boolean) => void;
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => { resolveConfirmation = resolve; }));
    const captured = { accountEpoch, runtimeRevision };
    const isCurrent = vi.fn(() => captured.accountEpoch === accountEpoch && captured.runtimeRevision === runtimeRevision);
    const request = vi.fn().mockResolvedValue("sent");
    const action = runConfirmedDeveloperMutation(confirm, isCurrent, request);

    await Promise.resolve();
    runtimeRevision += 1;
    resolveConfirmation(true);

    await expect(action).resolves.toEqual({ confirmed: false });
    expect(request).not.toHaveBeenCalled();
  });
});
