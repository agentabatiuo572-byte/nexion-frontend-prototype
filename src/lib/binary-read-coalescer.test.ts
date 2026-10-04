import { describe, expect, it, vi } from "vitest";
import { createScopedReadCoalescer, type BinaryPageReadScope } from "./binary-read-coalescer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const scope = (accountBindingEpoch = 1, runtimeEpoch = 1): BinaryPageReadScope => ({
  accountKey: "user:42",
  accountBindingEpoch,
  runtime: { runId: null, epoch: runtimeEpoch },
});

describe("binary page canonical read coalescer", () => {
  it("runs F3 and member reads once for concurrent restore, mounted and show calls in one scope", async () => {
    const f3 = deferred<void>();
    const network = deferred<boolean>();
    const read = vi.fn(() => Promise.all([f3.promise, network.promise]).then(() => undefined));
    const coalescer = createScopedReadCoalescer();

    const restore = coalescer.run(scope(), read);
    const mounted = coalescer.run(scope(), read);
    const shown = coalescer.run(scope(), read);
    expect(read).toHaveBeenCalledTimes(1);

    f3.resolve();
    network.resolve(true);
    await Promise.all([restore, mounted, shown]);
  });

  it("starts a new group after account or runtime scope changes without letting the old completion evict it", async () => {
    const older = deferred<void>();
    const newer = deferred<void>();
    const read = vi.fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);
    const coalescer = createScopedReadCoalescer();

    const first = coalescer.run(scope(), read);
    const second = coalescer.run(scope(2), read);
    expect(read).toHaveBeenCalledTimes(2);

    older.resolve();
    await first;
    const sameNewScope = coalescer.run(scope(2), read);
    expect(read).toHaveBeenCalledTimes(2);

    newer.resolve();
    await Promise.all([second, sameNewScope]);
  });

  it("starts a new group when only the runtime revision changes", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const read = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const coalescer = createScopedReadCoalescer();

    const oldRun = coalescer.run(scope(1, 1), read);
    const newRun = coalescer.run(scope(1, 2), read);
    expect(read).toHaveBeenCalledTimes(2);

    first.resolve();
    second.resolve();
    await Promise.all([oldRun, newRun]);
  });
});
