import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const api = fs.readFileSync(new URL("../src/api/withdrawal-api.ts", import.meta.url), "utf8");
const page = fs.readFileSync(new URL("../src/pages/me/wallet-withdraw.vue", import.meta.url), "utf8");

test("D5 policy requires the server-owned small amount and payout SLA fields", () => {
  assert.match(api, /smallAmountThresholdUsd:\s*number/);
  assert.match(api, /payoutSlaHours:\s*number/);
  assert.match(api, /const smallAmountThresholdUsd = number\(row\?\.smallAmountThresholdUsd\)/);
  assert.match(api, /const payoutSlaHours = number\(row\?\.payoutSlaHours/);
  assert.match(api, /smallAmountThresholdUsd === null/);
  assert.match(api, /payoutSlaHours === null/);
});

// 旧断言要求页面把小额线**写死成 0**(= 快车道整体不可达),那是 2026-08-10 后端还没实现免闸时的临时 HOLD。
// 现已过期,且与两条权威相反:① WD01 规格参数表把 `smallAmountThresholdUsd` 定为 D5 后台可配(默认 50,
// `0` 是运营用来关闭快车道的**取值**,不是客户端常量)—— 写死 0 等于客户端永久覆盖后台参数,撞「后台业务值
// 必须可配置」不变量;② 规格 §4.5 第二批把 `fastLaneApplied`/`waivedGates` 定为**服务端权威**(主人
// 2026-08-11 拍板),快车道判定不在客户端。所以这里改守「值与裁决都来自服务端」,而不是守那个临时常量。
// ⚠️ 不是删断言:「禁止从本地配置回落」这条保护仍然有效,原样保留。
// 2026-10-29 文案审查 D1:免审额度属于风控规则,页面不再展示「已免除」横幅和降额按钮,
// 也不再读取 smallAmountThresholdUsd;快车道的判定仍完全由服务端裁决。
test("withdraw page does not expose the fast-lane threshold or waived checks", () => {
  assert.doesNotMatch(page, /smallAmountThresholdUsd/);
  assert.doesNotMatch(page, /cfg\.config\.withdrawRules\.smallAmountThresholdUsd/);
  assert.doesNotMatch(page, /waivedGateLines|fastLaneOnBody|fastLaneCta/);
  assert.doesNotMatch(page, /useSmallAmountLine|smallLineDecision|fastLaneOverLine/);
});
