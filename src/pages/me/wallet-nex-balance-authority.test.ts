import { expect, test } from "vitest";
import { computed, reactive } from "vue";
import ts from "typescript";
import source from "./wallet-nex.vue?raw";
import { remoteAuthorityStatus } from "@/lib/remote-authority-display";

function mount(remote: boolean, hasSnapshot: boolean, balance: number, marketReady = true) {
  const block = source.slice(source.indexOf("const nexBalance ="), source.indexOf("// NEX activity"))
    + source.slice(source.indexOf("function fmtNum("), source.indexOf("function goMarket("))
    + source.slice(source.indexOf("const breakdownRows ="), source.indexOf("const useTiles ="));
  const code = ts.transpileModule(block, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const app = reactive({ remoteFleetHasSnapshot: hasSnapshot, user: { nexBalance: balance }, visibleDevices: [] });
  const market = reactive({ remoteReady: marketReady, remoteError: marketReady ? null : "failed", nexPriceUSDT: 2, costBasis: 1, change24hPct: 0 });
  const bills = reactive({ summaryStatus: "error", summary: { todayNexEarn: 0, pendingNex: 0 } });
  const section = { liquid: "liquid", mining: "mining", pending: "pending", costBasis: "basis", totalSpent: "spent", currentValue: "value" };
  const state = new Function("computed", "app", "market", "remoteApiEnabled", "remoteAuthorityStatus", "bills", "t", "tintIcon", "ICON", code + ";return {breakdownRows,pnlSummary,pnlCells,balanceKnown,valuationKnown,nexBalance,usdValue,fmtNum,fmtUSD};")(
    computed, app, market, remote, remoteAuthorityStatus, bills,
    { value: { nexWallet: { breakdown: section, pnl: section } } }, () => "", {});
  const balanceExpression = source.match(/:style="heroNumStyle">\{\{(.*?)\}\}/)?.[1];
  const valueExpression = source.match(/:style="heroUsdStyle">≈ \{\{(.*?)\}\}/)?.[1];
  if (!balanceExpression || !valueExpression) throw new Error("NEX hero bindings missing");
  const renderHero = () => ({
    balance: new Function("balanceKnown", "nexBalance", "fmtNum", `return (${balanceExpression});`)(state.balanceKnown.value, state.nexBalance.value, state.fmtNum),
    value: new Function("valuationKnown", "usdValue", "fmtUSD", `return (${valueExpression});`)(state.valuationKnown.value, state.usdValue.value, state.fmtUSD),
  });
  return { ...state, app, market, bills, renderHero };
}
test.each([[-2, "-2.00 NEX"], [2, "+2.00 NEX"], [0, "+0.00 NEX"]] as const)("formats the signed daily NEX net amount %s", (amount, expected) => {
  const s = mount(true, true, 50);
  s.bills.summary.todayNexEarn = amount;
  s.bills.summaryStatus = "ready";
  expect(s.breakdownRows.value[1].value).toBe(expected);
  s.bills.summaryStatus = "error";
  expect(s.breakdownRows.value[1].value).toBe("—");
});
test("missing wallet authority never displays zero holdings or invented valuation", () => {
  const s = mount(true, false, 0);
  expect(s.renderHero()).toEqual({balance:"—",value:"—"});
  expect(s.breakdownRows.value[0].value).toBe("—");
  expect(s.breakdownRows.value[0].hint).toBe("—");
  expect(s.pnlSummary.value).toBe("—");
  expect(s.pnlCells.value.slice(1).map((v: {value: string}) => v.value)).toEqual(["—", "—"]);
});
test("confirmed zero remains distinct from unavailable", () => {
  const s = mount(true, true, 0); expect(s.breakdownRows.value[0].value).toBe("0.00 NEX"); expect(s.breakdownRows.value[0].hint).toBe("$0.00");
});
test("snapshot arrival and account reset update all holding projections", () => {
  const s = mount(true, false, 50); expect(s.breakdownRows.value[0].value).toBe("—");
  s.app.remoteFleetHasSnapshot = true; expect(s.breakdownRows.value[0].value).toBe("50.00 NEX"); expect(s.breakdownRows.value[0].hint).toBe("$100.00");
  s.app.remoteFleetHasSnapshot = false; expect(s.breakdownRows.value[0].value).toBe("—"); expect(s.pnlSummary.value).toBe("—");
});
test("price failure retains known NEX units but hides USD calculations", () => {
  const s = mount(true, true, 50, false); expect(s.breakdownRows.value[0].value).toBe("50.00 NEX"); expect(s.breakdownRows.value[0].hint).toBe("—"); expect(s.pnlSummary.value).toBe("—");
});
test("local mode remains readable", () => { expect(mount(false, false, 12).breakdownRows.value[0].value).toBe("12.00 NEX"); });


test("page-show retries a failed balance read independently of bill failure", async () => {
  const s = mount(true, false, 0);
  const body = source.slice(source.indexOf("function refreshNexSummary()"), source.indexOf("onShow(refreshNexSummary)"));
  let attempts = 0;
  const refresh = new Function("remoteApiEnabled", "app", "bills", body + ";return refreshNexSummary;")(
    true,
    { refreshRemoteFleet: async () => { if (++attempts === 1) throw new Error("offline"); s.app.user.nexBalance = 12; s.app.remoteFleetHasSnapshot = true; } },
    { refreshSummary: async () => { throw new Error("bills unavailable"); } },
  );
  refresh(); await Promise.resolve();
  expect(s.renderHero().balance).toBe("—");
  refresh(); await Promise.resolve();
  expect(attempts).toBe(2);
  expect(s.renderHero()).toEqual({ balance: "12.00", value: "$24.00" });
});


test("ledger amounts keep their known units without inventing a USD quote", () => {
  const expression = source.match(/:style="activityUsdStyle">≈ \{\{(.*?)\}\}/)?.[1];
  expect(expression).toBeTruthy();
  const render = new Function("marketValueKnown", "a", "nexPrice", "fmtUSD", `return (${expression});`);
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  expect(render(false, { nex: 25 }, 0, fmt)).toBe("—");
  expect(render(true, { nex: 25 }, 2, fmt)).toBe("$50.00");
  expect(render(true, { nex: 0 }, 2, fmt)).toBe("$0.00");
  expect(render(true, { nex: -3 }, 2, fmt)).toBe("$-6.00");
});
