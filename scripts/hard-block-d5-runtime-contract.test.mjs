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
test("withdraw fast lane is server-owned: threshold from policy, waiver from the server verdict", () => {
  assert.match(page, /const smallAmountLine = computed\(\(\) => withdrawalPolicy\.value\?\.smallAmountThresholdUsd \?\? 0\)/);
  assert.doesNotMatch(page, /cfg\.config\.withdrawRules\.smallAmountThresholdUsd/);
  // 免闸展示只认服务端 verdict 里的 waivedGates,不许客户端按金额自己算出「已免去某某闸」
  assert.match(page, /eligibility\.value\.waivedGates/);
  // 降额建议在服务端裁决没到位时必须 fail-closed:不知道免不免,就不许劝用户改小金额
  const smallLine = page.slice(page.indexOf("const smallLineDecision"), page.indexOf("const fastLaneOverLine"));
  assert.match(smallLine, /canSubmit: false/);
  assert.match(smallLine, /route: "manual" as const/);
  assert.match(smallLine, /waivedGates: \[\]/);
  assert.match(page, /smallLineDecision = computed\(\(\) =>\s*remoteApiEnabled/);
});
