import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("OPS-E-18 active task center consumes server task pricing and routing", () => {
  const taskCenter = read("src/components/earn/task-center.vue");
  const api = read("src/api/earn-config-api.ts");
  const app = read("src/store/app.ts");
  const assignmentApi = read("src/api/task-assignment-api.ts");
  assert.doesNotMatch(taskCenter, /from "@\/mock\/tasks"/);
  assert.match(taskCenter, /prepareEarnConfig/);
  assert.match(taskCenter, /useEarnConfig/);
  assert.match(api, /\/api\/tasks\/route/);
  assert.match(assignmentApi, /\/api\/tasks\/assignments/);
  assert.match(assignmentApi, /\/api\/tasks\/receipts/);
  assert.match(app, /taskAssignmentApi\.state/);
  assert.doesNotMatch(app, /taskAssignmentApi\.(?:claim|complete)/);
  assert.match(app, /Task creation, completion,[\s\S]*server jobs/);
  assert.doesNotMatch(app, /subtle\.digest\(["']SHA-256["']/);
  assert.doesNotMatch(app, /function tick\(deltaMs: number\) \{\s*if \(remoteApiEnabled\) return;/);
  assert.match(app, /lockUntil/);
});

test("OPS-E-19 remote boot hydrates devices and lifecycle config from E3 fleet", () => {
  const app = read("src/store/app.ts");
  const root = read("src/App.vue");
  const lifecycle = read("src/store/device-lifecycle.ts");
  assert.match(app, /refreshRemoteFleet/);
  assert.match(root, /refreshRemoteFleet/);
  assert.match(lifecycle, /installCanonicalLifecycleConfig/);
  assert.match(app, /deviceE3Api\.fleet\(\)/);
});

test("OPS-E-19 remote device cards preserve server-realized earnings", () => {
  const app = read("src/store/app.ts");
  assert.match(app, /todayEarnings: device\.todayEarningsUsdt/);
  assert.match(app, /todayEarningsNEX: device\.todayEarningsNex/);
  assert.match(app, /function applyHomeEarnings\(projection: AppHomeOverview\)/);
  assert.match(app, /today: range\.today\.usdt \?\? 0/);
  assert.match(app, /todayNEX: range\.today\.nex \?\? 0/);
});

test("OPS-E-20 remote trade-in uses canonical quote, submit, and order readback", () => {
  const sheets = read("src/components/tradein-sheets.vue");
  const checkout = read("src/pages/store/checkout.vue");
  assert.match(sheets, /deviceE3Api\.quote/);
  assert.match(checkout, /deviceE3Api\.submit/);
  assert.match(checkout, /orderApi\.list/);
  assert.match(checkout, /sourceDeviceId/);
  assert.match(read("src/api/device-e3-api.ts"), /expectedPayableUsdt/);
  assert.match(checkout, /deviceE3Api\.capacityQuote/);
  assert.match(checkout, /RemoteCapacityGate/);
  assert.match(checkout, /remoteCapacityGate\.canConfirm/);
  assert.match(checkout, /canonicalStatus !== "activated"/);
  assert.match(checkout, /E3_TRADEIN_FLEET_READBACK_MISMATCH/);
  assert.match(checkout, /E20_CAPACITY_AVAILABLE_ORDER_READBACK_MISMATCH/);
  assert.match(sheets, /deviceE3Api\.capacityReplace/);
  assert.match(sheets, /orders\.refreshRemote/);
  assert.match(sheets, /app\.refreshRemoteFleet/);
  assert.match(sheets, /if \(remoteApiEnabled\) \{[\s\S]{0,500}submitCanonicalCapacityReplacement[\s\S]{0,200}return;/);
  assert.match(sheets, /if \(remoteApiEnabled\) \{[\s\S]{0,300}submitCanonicalKeepBuy[\s\S]{0,100}return;/);
  assert.match(sheets, /never execute the legacy local force composer against canonical state/);
  assert.match(sheets, /CAPACITY_REPLACEMENT_FLEET_READBACK_MISMATCH/);
  assert.doesNotMatch(checkout, /remoteApiEnabled[\s\S]{0,500}tradein\.showReplace\(/);
});

test("OPS-E-20 retry safety retains trade-in context until durable order and fleet readback", () => {
  const checkout = read("src/pages/store/checkout.vue");
  const coordinator = read("src/domain/e20-capacity-coordinator.ts");
  const refresh = coordinator.indexOf("await steps.refreshFleet()");
  const fleetCheck = coordinator.indexOf("steps.verifyFleet(result)", refresh);
  const commit = coordinator.indexOf("await steps.commit(result)", fleetCheck);
  const commitOrder = checkout.indexOf("orderId.value = submitted.orderNo", checkout.indexOf("commit(submitted)"));
  const clearContext = checkout.indexOf("tradein.clearApplied()", commitOrder);
  assert.ok(refresh >= 0 && fleetCheck > refresh && commit > fleetCheck);
  assert.ok(commitOrder >= 0 && clearContext > commitOrder);
  assert.match(checkout, /StableCommandKey/);
  assert.match(checkout, /v-if="!remoteTradeinRecoveryRequired"[\s\S]{0,200}@click="removeTradein"/);
  assert.match(checkout, /function removeTradein\(\) \{[\s\S]{0,160}remoteTradeinRecoveryRequired\.value[\s\S]{0,80}return;/);
  const mutationFreeze = checkout.indexOf("remoteTradeinRecoveryRequired.value = true");
  const remoteSubmit = checkout.indexOf("deviceE3Api.submit", mutationFreeze);
  const recoveryRelease = checkout.indexOf("remoteTradeinRecoveryRequired.value = false", remoteSubmit);
  assert.ok(mutationFreeze >= 0 && remoteSubmit > mutationFreeze && recoveryRelease > remoteSubmit);
});

test("OPS-E-20 both visible NO_ACTIVE_DEVICE entries preserve the authoritative actionable reason", () => {
  const checkout = read("src/pages/store/checkout.vue");
  const sheets = read("src/components/tradein-sheets.vue");
  const coordinator = read("src/domain/e20-capacity-coordinator.ts");
  const zh = read("src/i18n/messages/zh.ts");

  assert.match(coordinator, /handleNoActiveDeviceDecision/);
  assert.match(checkout, /handleNoActiveDeviceDecision/);
  assert.match(sheets, /handleNoActiveDeviceDecision/);
  assert.match(zh, /errNoActiveDevice: "无可置换的活跃设备，请到设备\/仓库核对或联系客服"/);
  // 🔴 语言面必须三语齐点(门的门 ① 判据):只点一种语言时,另两种可以随意漂移而本门全绿。
  // 实测过的失败形态:语言豁免表不带语言维 → vi 真丢了占位符照样绿。
  // 中文钉**原文**(话术是产品决定),英/越只钉**键存在** —— 措辞由翻译定,但键不许缺。
  for (const [loc, src] of [["en", read("src/i18n/messages/en.ts")], ["vi", read("src/i18n/messages/vi.ts")]]) {
    assert.match(src, /errNoActiveDevice:/, `${loc}.ts 缺 errNoActiveDevice`);
  }
  assert.doesNotMatch(checkout, /NO_ACTIVE_DEVICE[\s\S]{0,220}errReplaceUnavailable/);
  assert.doesNotMatch(sheets, /NO_ACTIVE_DEVICE[\s\S]{0,220}errReplaceUnavailable/);
});
