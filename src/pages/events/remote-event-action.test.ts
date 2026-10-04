import { describe, expect, it, vi } from "vitest";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import { createRemotePageCommandFence } from "@/lib/remote-page-command-fence";
import { runRemoteEventAction } from "./remote-event-action";

function deferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve: resolve! };
}

describe("remote event actions", () => {
  it("is quiet when an A action resolves after the page binds B", async () => {
    const accountEpoch = createRemoteAccountEpoch("A");
    let visible = true;
    const fence = createRemotePageCommandFence(accountEpoch, () => visible);
    const result = deferred<boolean>();
    const refresh = vi.fn();
    const success = vi.fn();
    const failure = vi.fn();

    const action = runRemoteEventAction({
      fence,
      command: () => result.promise,
      refresh,
      onSuccess: success,
      onFailure: failure,
    });
    accountEpoch.bind("B");
    result.resolve(false);
    await action;

    expect(refresh).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
  });

  it("keeps the canonical command success when the page hides during readback", async () => {
    const accountEpoch = createRemoteAccountEpoch("A");
    let visible = true;
    const fence = createRemotePageCommandFence(accountEpoch, () => visible);
    const refreshResult = deferred<void>();
    const success = vi.fn();
    const failure = vi.fn();

    const action = runRemoteEventAction({
      fence,
      command: async () => true,
      refresh: () => refreshResult.promise,
      onSuccess: success,
      onFailure: failure,
    });
    await Promise.resolve();
    expect(failure).not.toHaveBeenCalled();

    visible = false;
    fence.invalidate();
    refreshResult.resolve();
    await action;

    expect(success).toHaveBeenCalledTimes(1);
    expect(failure).not.toHaveBeenCalled();
  });
});
