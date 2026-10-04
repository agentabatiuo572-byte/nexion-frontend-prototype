// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import ts from "typescript";
import { computed, reactive, ref } from "vue";
import { describe, expect, it } from "vitest";

// The wallet payment row used to render only the static label "USDT balance",
// with no figure and no loading/unavailable state, so the buyer could not tell
// what the server actually had available before continuing.
const source = readFileSync(new URL("./checkout.vue", import.meta.url), "utf8");

function extract(start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`missing block ${start}`);
  return ts.transpileModule(source.slice(from, to), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
}

const block = extract("const checkoutWalletRefreshing", "function checkoutRouteIdentity");

function view(app: Record<string, unknown>) {
  const t = ref({
    wallet: { usdtBalance: "USDT balance", fundsUnavailableTitle: "Wallet couldn't be refreshed" },
    help: { loadingMore: "Loading…" },
  });
  return new Function("computed", "ref", "remoteApiEnabled", "app", "t",
    `${block}\nreturn { walletBalanceHint, checkoutWalletReadable };`,
  )(computed, ref, true, app, t);
}

describe("checkout wallet balance hint", () => {
  it("shows the server-confirmed available balance instead of a bare label", () => {
    const v = view(reactive({
      user: { usdtBalance: 1299 },
      remoteFleetHasSnapshot: true,
      remoteWalletReceiptHasSnapshot: false,
      remoteFleetStatus: "ready",
    }));
    expect(v.walletBalanceHint.value).toBe("USDT balance · $1299.00");
  });

  it("states loading and unavailable instead of a stale number", () => {
    const loading = view(reactive({
      user: { usdtBalance: 0 },
      remoteFleetHasSnapshot: false,
      remoteWalletReceiptHasSnapshot: false,
      remoteFleetStatus: "loading",
    }));
    expect(loading.walletBalanceHint.value).toBe("Loading…");

    const failed = view(reactive({
      user: { usdtBalance: 0 },
      remoteFleetHasSnapshot: false,
      remoteWalletReceiptHasSnapshot: false,
      remoteFleetStatus: "error",
    }));
    expect(failed.walletBalanceHint.value).toBe("Wallet couldn't be refreshed");
  });
});
