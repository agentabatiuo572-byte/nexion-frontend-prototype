import { describe, expect, it } from "vitest";
import { createLocaleProfileSync } from "./locale-profile-sync";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe("locale profile sync", () => {
  it("serializes quick changes so the latest locale is the last server write", async () => {
    const first = deferred<string>();
    const writes: string[] = [];
    const scope = { accountId: "user:42", revision: 3 };
    const sync = createLocaleProfileSync({
      currentScope: () => scope,
      write: async (language) => {
        writes.push(language);
        if (language === "zh") return first.promise;
        return language;
      },
    });

    sync.request("zh");
    sync.request("vi");
    expect(writes).toEqual(["zh"]);
    first.resolve("zh");
    await sync.flush();

    expect(writes).toEqual(["zh", "vi"]);
  });

  it("drops queued work after the authenticated account epoch changes", async () => {
    const first = deferred<string>();
    const writes: string[] = [];
    let scope = { accountId: "user:42", revision: 3 };
    const sync = createLocaleProfileSync({
      currentScope: () => scope,
      write: async (language) => {
        writes.push(language);
        if (language === "zh") return first.promise;
        return language;
      },
    });

    sync.request("zh");
    scope = { accountId: "user:99", revision: 4 };
    sync.request("vi");
    first.resolve("zh");
    await sync.flush();

    expect(writes).toEqual(["zh", "vi"]);
  });

  it("does not dispatch without a current authenticated scope", async () => {
    const write = async () => "en";
    const sync = createLocaleProfileSync({ currentScope: () => null, write });

    sync.request("zh");
    await sync.flush();

    expect(sync.pending()).toBeNull();
  });

  it("retains a failed current request for the next explicit sync trigger", async () => {
    let attempts = 0;
    const sync = createLocaleProfileSync({
      currentScope: () => ({ accountId: "user:42", revision: 3 }),
      write: async (language) => {
        attempts += 1;
        if (attempts === 1) throw new Error("NETWORK_UNAVAILABLE");
        return language;
      },
    });

    sync.request("zh");
    await sync.flush();
    expect(sync.pending()).toMatchObject({ language: "zh" });

    sync.request("zh");
    await sync.flush();
    expect(attempts).toBe(2);
    expect(sync.pending()).toBeNull();
  });

  it("drops a failed retry when a different account becomes current", async () => {
    let scope: { accountId: string; revision: number } | null = { accountId: "user:42", revision: 3 };
    const sync = createLocaleProfileSync({
      currentScope: () => scope,
      write: async () => { throw new Error("NETWORK_UNAVAILABLE"); },
    });
    sync.request("zh");
    await sync.flush();
    expect(sync.pending()).toMatchObject({ scope: { accountId: "user:42" } });

    scope = { accountId: "user:99", revision: 4 };
    sync.discardInactive();
    expect(sync.pending()).toBeNull();
  });

  // The locale write's own transport can refresh the bearer, advancing the vault
  // revision while the account stays the same. Treating that revision as part of
  // the identity made the in-flight job look inactive: the state stayed
  // "syncing" forever and the page never left "syncing account language".
  it("finishes a write whose bearer refresh advanced the revision on the same account", async () => {
    let scope = { accountId: "user:42", revision: 3 };
    const states: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const sync = createLocaleProfileSync({
      currentScope: () => scope,
      write: async () => { await gate; return "en"; },
      onState: (state) => states.push(state),
    });

    sync.request("en");
    scope = { accountId: "user:42", revision: 4 };
    release();
    await sync.flush();

    expect(sync.pending()).toBeNull();
    expect(states.at(-1)).toBe("idle");
  });
});
