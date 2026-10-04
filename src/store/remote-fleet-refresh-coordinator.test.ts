import { describe, expect, it, vi } from "vitest";
import {
  createRemoteFleetRefreshCoordinator,
  type RemoteFleetRefreshScope,
} from "./remote-fleet-refresh-coordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function scope(overrides: Partial<RemoteFleetRefreshScope> = {}): RemoteFleetRefreshScope {
  return {
    accountKey: "user:1001",
    accountEpoch: 4,
    mode: "dev",
    runId: null,
    runEpoch: 9,
    ...overrides,
  };
}

describe("remote fleet refresh coordinator", () => {
  it("coalesces duplicate concurrent reads for one account, epoch, mode, and run", async () => {
    const coordinator = createRemoteFleetRefreshCoordinator();
    const pending = deferred<string>();
    const execute = vi.fn(() => pending.promise);

    const first = coordinator.refresh(scope(), execute, { coalesce: true });
    const duplicate = coordinator.refresh(scope(), execute, { coalesce: true });

    expect(duplicate).toBe(first);
    expect(execute).toHaveBeenCalledTimes(1);
    pending.resolve("fleet");
    await expect(first).resolves.toBe("fleet");
  });

  it("does not coalesce reads from different API modes", async () => {
    const coordinator = createRemoteFleetRefreshCoordinator();
    const first = deferred<string>();
    const second = deferred<string>();
    const execute = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const developmentRead = coordinator.refresh(scope({ mode: "dev" }), execute, { coalesce: true });
    const productionRead = coordinator.refresh(scope({ mode: "prod" }), execute, { coalesce: true });

    expect(execute).toHaveBeenCalledTimes(2);
    first.resolve("development");
    second.resolve("production");
    await expect(developmentRead).resolves.toBe("development");
    await expect(productionRead).resolves.toBe("production");
  });

  it("does not coalesce reads from different runtime epochs", async () => {
    const coordinator = createRemoteFleetRefreshCoordinator();
    const first = deferred<string>();
    const second = deferred<string>();
    const execute = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const previousRun = coordinator.refresh(scope({ runEpoch: 9 }), execute, { coalesce: true });
    const currentRun = coordinator.refresh(scope({ runEpoch: 10 }), execute, { coalesce: true });

    expect(execute).toHaveBeenCalledTimes(2);
    first.resolve("previous-run");
    second.resolve("current-run");
    await expect(previousRun).resolves.toBe("previous-run");
    await expect(currentRun).resolves.toBe("current-run");
  });

  it("clears a failed request so the next read retries instead of inheriting its failure", async () => {
    const coordinator = createRemoteFleetRefreshCoordinator();
    const first = deferred<string>();
    const second = deferred<string>();
    const execute = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const failed = coordinator.refresh(scope(), execute, { coalesce: true });
    first.reject(new Error("FLEET_UNAVAILABLE"));
    await expect(failed).rejects.toThrow("FLEET_UNAVAILABLE");

    const retry = coordinator.refresh(scope(), execute, { coalesce: true });
    expect(execute).toHaveBeenCalledTimes(2);
    second.resolve("retried-fleet");
    await expect(retry).resolves.toBe("retried-fleet");
  });

  it("keeps the default refresh mutation-safe instead of reusing an earlier read", async () => {
    const coordinator = createRemoteFleetRefreshCoordinator();
    const first = deferred<string>();
    const second = deferred<string>();
    const execute = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const staleRead = coordinator.refresh(scope(), execute);
    const postMutationRead = coordinator.refresh(scope(), execute);

    expect(execute).toHaveBeenCalledTimes(2);
    second.resolve("wallet-after-mutation");
    await expect(postMutationRead).resolves.toBe("wallet-after-mutation");
    first.resolve("wallet-before-mutation");
    await expect(staleRead).resolves.toBe("wallet-before-mutation");
  });

  it("does not let an old-account completion become the current refresh", async () => {
    const coordinator = createRemoteFleetRefreshCoordinator();
    const oldPending = deferred<string>();
    const currentPending = deferred<string>();
    const committed: string[] = [];

    const oldRead = coordinator.refresh(scope({ accountKey: "user:1001", accountEpoch: 4 }), async (lease) => {
      const value = await oldPending.promise;
      if (coordinator.isCurrent(lease)) committed.push(value);
      return value;
    });
    const currentRead = coordinator.refresh(scope({ accountKey: "user:2002", accountEpoch: 5 }), async (lease) => {
      const value = await currentPending.promise;
      if (coordinator.isCurrent(lease)) committed.push(value);
      return value;
    });

    currentPending.resolve("current-account");
    await expect(currentRead).resolves.toBe("current-account");
    oldPending.resolve("old-account");
    await expect(oldRead).resolves.toBe("old-account");

    expect(committed).toEqual(["current-account"]);
  });

  it("forces a fresh post-mutation read instead of reusing a pre-mutation request", async () => {
    const coordinator = createRemoteFleetRefreshCoordinator();
    const preMutation = deferred<string>();
    const postMutation = deferred<string>();
    const execute = vi.fn()
      .mockReturnValueOnce(preMutation.promise)
      .mockReturnValueOnce(postMutation.promise);

    const staleRead = coordinator.refresh(scope(), execute);
    const freshRead = coordinator.refresh(scope(), execute, { force: true });

    expect(execute).toHaveBeenCalledTimes(2);
    postMutation.resolve("wallet-after-mutation");
    await expect(freshRead).resolves.toBe("wallet-after-mutation");
    preMutation.resolve("wallet-before-mutation");
    await expect(staleRead).resolves.toBe("wallet-before-mutation");
  });

  it("invalidates a pre-mutation read so the normal post-mutation refresh is fresh", async () => {
    const coordinator = createRemoteFleetRefreshCoordinator();
    const preMutation = deferred<string>();
    const postMutation = deferred<string>();
    const execute = vi.fn()
      .mockReturnValueOnce(preMutation.promise)
      .mockReturnValueOnce(postMutation.promise);

    const staleRead = coordinator.refresh(scope(), execute);
    coordinator.invalidate(scope());
    const freshRead = coordinator.refresh(scope(), execute);

    expect(execute).toHaveBeenCalledTimes(2);
    postMutation.resolve("wallet-after-mutation");
    await expect(freshRead).resolves.toBe("wallet-after-mutation");
    preMutation.resolve("wallet-before-mutation");
    await expect(staleRead).resolves.toBe("wallet-before-mutation");
  });

  it("keeps the fresh mutation read coalesced when the invalidated older request fails", async () => {
    const coordinator = createRemoteFleetRefreshCoordinator();
    const stale = deferred<string>();
    const fresh = deferred<string>();
    const execute = vi.fn()
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(fresh.promise);

    const staleRead = coordinator.refresh(scope(), execute, { coalesce: true });
    coordinator.invalidate(scope());
    const freshRead = coordinator.refresh(scope(), execute, { coalesce: true });

    stale.reject(new Error("STALE_FLEET_UNAVAILABLE"));
    await expect(staleRead).rejects.toThrow("STALE_FLEET_UNAVAILABLE");

    const duplicateFreshRead = coordinator.refresh(scope(), execute, { coalesce: true });
    expect(duplicateFreshRead).toBe(freshRead);
    expect(execute).toHaveBeenCalledTimes(2);
    fresh.resolve("wallet-after-mutation");
    await expect(freshRead).resolves.toBe("wallet-after-mutation");
  });
});
