import { describe, expect, it } from "vitest";
import { computed, reactive } from "vue";
import ts from "typescript";
import walletPage from "../pages/me/wallet.vue?raw";
import { resolveWalletTodayEarnings } from "./wallet-today-earnings";

describe("wallet today earnings authority", () => {
  it("renders the wallet Today binding from Home and keeps pending earnings separate", () => {
    const app = reactive({
      homeTruthStatus: "ready",
      homeTruth: { earnings: { today: { usdt: 422 } } },
      earnings: { today: 99 },
      user: { pendingEarnings: 800 },
    });
    const start = walletPage.indexOf("const todayEarnings =");
    const end = walletPage.indexOf("const pendingReview =", start);
    if (start < 0 || end < start) throw new Error("Wallet Today projection missing");
    const code = ts.transpileModule(walletPage.slice(start, end), {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const state = new Function("computed", "app", "remoteApiEnabled", "resolveWalletTodayEarnings",
      `${code}\nreturn { todayEarningsText };`,
    )(computed, app, true, resolveWalletTodayEarnings);
    const row = walletPage.slice(walletPage.indexOf(':label="t.wallet.todayLabel"'), walletPage.indexOf(':label="t.wallet.reviewingEarnings"'));
    const binding = row.match(/#value><text[^>]*>\{\{(.*?)\}\}/)?.[1];
    if (!binding) throw new Error("Wallet Today text binding missing");
    const render = () => new Function("todayEarningsText", `return (${binding});`)(state.todayEarningsText.value);
    expect(render()).toBe("+$422.00");
    app.user.pendingEarnings = 999;
    expect(render()).toBe("+$422.00");
    app.homeTruthStatus = "error";
    expect(render()).toBe("—");
    app.homeTruth.earnings.today.usdt = 0;
    app.homeTruthStatus = "ready";
    expect(render()).toBe("+$0.00");
  });

  it("uses the ready Home projection even when pending earnings are zero", () => {
    const remoteSnapshot = {
      remoteApiEnabled: true,
      homeTruthStatus: "ready" as const,
      homeTodayUsdt: 422,
      localTodayUsdt: 0,
      pendingEarnings: 0,
    };

    expect(resolveWalletTodayEarnings(remoteSnapshot)).toBe(422);
  });

  it("stays unknown when the Home projection is absent, loading, or failed", () => {
    expect(resolveWalletTodayEarnings({
      remoteApiEnabled: true,
      homeTruthStatus: "ready",
      homeTodayUsdt: null,
      localTodayUsdt: 0,
    })).toBeNull();
    expect(resolveWalletTodayEarnings({
      remoteApiEnabled: true,
      homeTruthStatus: "loading",
      homeTodayUsdt: 422,
      localTodayUsdt: 0,
    })).toBeNull();
    expect(resolveWalletTodayEarnings({
      remoteApiEnabled: true,
      homeTruthStatus: "error",
      homeTodayUsdt: 422,
      localTodayUsdt: 0,
    })).toBeNull();
  });
});
