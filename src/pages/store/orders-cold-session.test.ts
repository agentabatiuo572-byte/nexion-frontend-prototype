// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { computed, reactive, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

// A cold H5 start issues protected reads before the cookie restore binds the
// account, so the transport answers AUTH_REQUIRED and the page settled on
// "account state could not be confirmed" with an empty order list. The fence
// must hold every read until the restored session is actually bound.
const source = readFileSync(new URL("./orders.vue", import.meta.url), "utf8");

function extract(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`missing block ${start}`);
  return ts.transpileModule(source.slice(from, to), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

const ready = extract("const remoteSessionReady = computed", "type CommerceOrderListItem");
const refresh = extract("const remoteOrderAvailability", "function requestOrdersRefresh");

function view(auth: Record<string, unknown>, app: Record<string, unknown>, vaultUser: number | null) {
  const orders = { refreshRemote: vi.fn().mockResolvedValue(undefined) };
  const genesis = { syncRemote: vi.fn().mockResolvedValue(true), remoteEligibilityError: null };
  const binarySessionReady = (input: Record<string, unknown>) =>
    input.authenticated === true
    && input.sessionUserId !== null
    && input.accountId === input.appAccountKey
    && input.appAccountKey === `user:${input.sessionUserId}`;
  const result = new Function(
    "computed", "ref", "app", "auth", "orders", "genesis", "binarySessionReady", "remoteApiEnabled",
    "sessionVault", "createRemoteOrdersRefresh", "isInitialOrderReadLoading", "orderListPanels",
    "remoteCommerceRequestCurrent",
    `${ready}\n${refresh}\nreturn { refreshOrders, remoteSessionReady };`,
  )(
    computed, ref, app, auth, orders, genesis, binarySessionReady, true,
    { read: () => (vaultUser === null ? null : { user: { userId: vaultUser } }) },
    () => async () => {
      await orders.refreshRemote();
      await genesis.syncRemote();
      return { availability: "ready", commerceUnavailable: false, genesisUnavailable: false };
    },
    () => false, () => ({ mainPresentation: "empty" }), () => true,
  );
  return { result, orders, genesis };
}

describe("orders cold session fence", () => {
  it("does not start a protected order read before the cookie restore binds the account", async () => {
    const auth = reactive({ isAuthenticated: true, accountId: "user:607" });
    const app = reactive({ accountKey: "default", accountBindingEpoch: 1 });
    const s = view(auth, app, 607);

    await s.result.refreshOrders();
    expect(s.orders.refreshRemote).not.toHaveBeenCalled();

    app.accountKey = "user:607";
    await Promise.resolve();
    expect(s.result.remoteSessionReady.value).toBe(true);

    await s.result.refreshOrders();
    expect(s.orders.refreshRemote).toHaveBeenCalledTimes(1);
    expect(s.genesis.syncRemote).toHaveBeenCalledTimes(1);
  });
});
