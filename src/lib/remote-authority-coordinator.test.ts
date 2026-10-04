import { describe, expect, it, vi } from "vitest";
import { createRemoteAuthorityCoordinator } from "./remote-authority-coordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("remote authority coordinator", () => {
  it("drops a GET that started before a mutation", async () => {
    const coordinator = createRemoteAuthorityCoordinator();
    const response = deferred<string>();
    const read = coordinator.guardedRead("account-a", () => response.promise);
    const mutation = coordinator.beginMutation("account-a");
    response.resolve("stale");
    expect(await read).toBeNull();
    mutation.finish();
  });

  it("waits for same-account mutation and does not block another account", async () => {
    const coordinator = createRemoteAuthorityCoordinator();
    const mutation = coordinator.beginMutation("account-a");
    const fetchA = vi.fn(async () => "a");
    const fetchB = vi.fn(async () => "b");

    const readA = coordinator.guardedRead("account-a", fetchA);
    const readB = coordinator.guardedRead("account-b", fetchB);
    expect(await readB).toBe("b");
    expect(fetchA).not.toHaveBeenCalled();

    mutation.finish();
    expect(await readA).toBe("a");
  });
});
