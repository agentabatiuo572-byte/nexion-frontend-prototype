// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { computed, reactive } from "vue";
import { describe, expect, it, vi } from "vitest";

// The withdraw page fired refreshRemoteFleet / loadWithdrawalPolicy / earnings
// release before the cookie restore bound the account. The transport threw
// AUTH_REQUIRED, financialFactState treated it as terminal, and the page stayed
// on "wallet could not be refreshed" with submission permanently disabled.
const source = readFileSync(new URL("./wallet-withdraw.vue", import.meta.url), "utf8");

function extract(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`missing block ${start}`);
  return ts.transpileModule(source.slice(from, to), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

const ready = extract("const remoteSessionReady = computed", "async function retryWithdrawalFacts");
const retry = extract("async function retryWithdrawalFacts", "function invalidateWithdrawalFacts");

function view(auth: Record<string, unknown>, app: Record<string, unknown>) {
  const calls = {
    fleet: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue(true),
    policy: vi.fn().mockResolvedValue(undefined),
  };
  const binarySessionReady = (input: Record<string, unknown>) =>
    input.authenticated === true
    && input.sessionUserId !== null
    && input.accountId === input.appAccountKey
    && input.appAccountKey === `user:${input.sessionUserId}`;
  const appProxy = Object.assign(app, {
    refreshRemoteFleet: calls.fleet,
    refreshRemoteWithdrawalList: calls.list,
  });
  const result = new Function(
    "computed", "remoteApiEnabled", "app", "auth", "sessionVault", "binarySessionReady",
    "refreshEarningsReleaseStatus", "loadWithdrawalPolicy",
    `${ready}\n${retry}\nreturn { retryWithdrawalFacts, remoteSessionReady };`,
  )(
    computed, true, appProxy, auth, { read: () => ({ user: { userId: 607 } }) }, binarySessionReady,
    calls.release, calls.policy,
  );
  return { result, calls };
}

describe("withdraw page cold session fence", () => {
  it("defers every protected withdraw read until the restored session binds the account", async () => {
    const auth = reactive({ isAuthenticated: true, accountId: "user:607" });
    const app = reactive({ accountKey: "default", accountBindingEpoch: 1 });
    const s = view(auth, app);

    await s.result.retryWithdrawalFacts();
    expect(s.calls.fleet).not.toHaveBeenCalled();
    expect(s.calls.policy).not.toHaveBeenCalled();

    app.accountKey = "user:607";
    await Promise.resolve();
    expect(s.result.remoteSessionReady.value).toBe(true);

    await s.result.retryWithdrawalFacts();
    expect(s.calls.fleet).toHaveBeenCalledTimes(1);
    expect(s.calls.release).toHaveBeenCalledWith("user:607");
    expect(s.calls.list).toHaveBeenCalledWith("user:607");
    expect(s.calls.policy).toHaveBeenCalledTimes(1);
  });
});
