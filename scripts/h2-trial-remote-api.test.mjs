import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");
const trialSource = read("src/api/trial-api.ts")
  .replace(/^import .*;\r?\n/gm, "");
const compiledTrial = ts.transpileModule(
  `const isCurrentCommerceSandboxRun = () => false;\n${trialSource}`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
).outputText;
const { createTrialApi } = await import(`data:text/javascript;base64,${Buffer.from(compiledTrial).toString("base64")}`);

function clientReturning(data) {
  const requests = [];
  return {
    requests,
    request: async (request) => {
      requests.push(request);
      return data;
    },
    refreshSession: async () => { throw new Error("unused"); },
  };
}

const activeState = {
  authoritative: true,
  state: "ACTIVE",
  canStart: false,
  eligibilityReason: "in-progress",
  claimNo: "TRIAL-1",
  version: 3,
  serverNowEpochMs: 1_800_000_000_000,
  claimedAt: "2027-01-15T08:00:00",
  claimedAtEpochMs: 1_800_000_000_000,
  expiresAt: "2027-01-18T08:00:00",
  expiresAtEpochMs: 1_800_259_200_000,
  graceEndsAt: "2027-01-25T08:00:00",
  graceEndsAtEpochMs: 1_800_864_000_000,
  cooldownUntil: null,
  shadowUsdt: "12.5",
  shadowNex: 20,
  source: "nx_trial_claim + nx_user_wallet",
  paymentRail: "NEXION_USDT_WALLET",
  config: {
    trialDays: "3", graceDays: "7", extensionDays: "3", discountRate: "0.15",
    discountCapUSD: "20", trialOffsetCapUSD: "50", autoChargeAtEnd: "true",
    highQualityThresholdUSD: "100", trialProductId: "stellarbox-s1", trialPriceUSD: "1299",
    shadowDailyUSD: "38.52", shadowDailyNEX: "65", cooldownDays: "30", phaseOpen: "true",
    autoPushEnabled: "true", autoPushDelayMs: "1500", autoPushCooldownHours: "24",
    autoPushMaxPerSession: "1",
  },
};

test("trial API parses only authoritative known states", async () => {
  const client = clientReturning(activeState);
  const state = await createTrialApi(client).state();
  assert.equal(state.status, "active");
  assert.equal(state.claimNo, "TRIAL-1");
  assert.equal(state.shadowUSD, 12.5);
  assert.equal(state.startedAt, activeState.claimedAtEpochMs);
  assert.equal(client.requests[0].path, "/api/trial/state");
});

test("trial API accepts canonical boolean DTO values and current Chinese enum values only", async () => {
  const actualBooleanDto = await createTrialApi(clientReturning({
    ...activeState,
    config: { ...activeState.config, phaseOpen: true, autoPushEnabled: false },
  })).state();
  assert.equal(actualBooleanDto.config.phaseOpen, true);
  assert.equal(actualBooleanDto.config.autoPushEnabled, false);

  const currentLegacyDto = await createTrialApi(clientReturning({
    ...activeState,
    config: { ...activeState.config, phaseOpen: "开放", autoPushEnabled: "开" },
  })).state();
  assert.equal(currentLegacyDto.config.phaseOpen, "开放");
  assert.equal(currentLegacyDto.config.autoPushEnabled, "开");
});

test("trial API rejects unknown, non-authoritative, and contradictory responses", async () => {
  for (const mutation of [
    { state: "MYSTERY" },
    { authoritative: false },
    { state: "ACTIVE", canStart: true },
    { eligibilityReason: undefined },
    { serverNowEpochMs: "not-a-time" },
  ]) {
    const client = clientReturning({ ...activeState, ...mutation });
    await assert.rejects(() => createTrialApi(client).state(), /TRIAL_RESPONSE_INVALID/);
  }
});

test("trial commands carry idempotency keys and parse authoritative receipts", async () => {
  const client = clientReturning(activeState);
  const api = createTrialApi(client);
  await api.start("h2-start-1", "NexGridBox S1");
  await api.cancel("explicit", "h2-cancel-1");
  assert.deepEqual(client.requests.map((request) => [request.path, request.idempotencyKey]), [
    ["/api/trial/start", "h2-start-1"],
    ["/api/trial/cancel", "h2-cancel-1"],
  ]);
  assert.deepEqual(client.requests[0].body, { deviceName: "NexGridBox S1" });
  assert.deepEqual(client.requests[1].body, { reason: "explicit" });
});

test("trial conversion posts the product and stable idempotency key and validates the server order receipt", async () => {
  const client = clientReturning({
    orderNo: "TRC-ABC123", productNo: "stellarbox-s1", amountUsdt: 1200,
    discountUsdt: 99, paymentStatus: "PENDING", orderStatus: "PENDING_PAYMENT",
    sourceEnvironment: "PRODUCTION",
  });
  // 客户端报价是**独立契约字段**(4c32a50 起 convert 签名为 productNo/expectedAmountUsdt/idempotencyKey,
  // 真实调用方 store/free-trial.ts 传 `expectedAmountUsdt ?? null`)。传真值而不是 null,
  // 这样这条断言除了钉住幂等键,也钉住金额确实按原值上行(被吞掉或被挪位都会红)。
  await createTrialApi(client).convert("stellarbox-s1", 1200, "h2-convert-TRIAL-1");
  assert.deepEqual(client.requests[0], {
    method: "POST", path: "/api/trial/convert",
    body: { productNo: "stellarbox-s1", expectedAmountUsdt: 1200 },
    idempotencyKey: "h2-convert-TRIAL-1",
  });
});

test("trial start sends the device mapped from the authoritative product config", async () => {
  const client = clientReturning({
    ...activeState,
    config: { ...activeState.config, trialProductId: "device-trial-standard" },
  });
  const api = createTrialApi(client);
  await api.start("h2-start-product-contract", "NexGridBox S1");
  assert.deepEqual(client.requests[0].body, { deviceName: "NexGridBox S1" });
});

test("eligible first-time users retain a visible H2 claim entry which opens the real claim flow", () => {
  const earn = read("src/pages/earn/earn.vue");
  const hero = read("src/components/trial-hero-banner.vue");
  const sheet = read("src/components/trial-claim-sheet.vue");
  assert.match(earn, /<TrialHeroBanner class="w-full"/);
  assert.match(hero, /trial\.status === "none" && trial\.canStart\(\)/);
  assert.match(hero, /@click="onClick"/);
  assert.match(hero, /claimSheet\.show\(\)/);
  assert.match(sheet, /await freeTrial\.start\(\)/);
});

test("remote free-trial store never persists or locally advances an authoritative terminal state", () => {
  const source = read("src/store/free-trial.ts");
  assert.match(source, /trialApi/);
  assert.match(source, /remoteApiEnabled/);
  assert.match(source, /async function refreshRemote/);
  assert.match(source, /trialApi\.eligibility\(\)/);
  assert.match(source, /refreshRemote\(true\)/);
  assert.match(source, /authorityRequestSequence/);
  assert.match(source, /if \(remoteApiEnabled\) return refreshRemote\(\)/);
  // 🔴 「远端档不落本地盘」——判据锚在 persist() 的函数头上,不是全文找一个字符串。
  // 原判据是 /if \(remoteApiEnabled\) return;/,写于 5d3c92e(当时 persist() 是 void);
  // da445ec(审计 R5)把 persist() 改成返回落盘判决(convert 据此决定终态算不算落定)后,
  // 这条恒红至今,而且方向是**奖励回退**:谁把 persist() 改回 void 它就转绿。
  // 锚定形态顺带守住位置语义 —— 短路必须是函数第一句,挪到 writeAccountRow 之后就红。
  assert.match(source, /function persist\(\)[^{]*\{\s+if \(remoteApiEnabled\) return true;/,
    "[persist-guard] persist() 的第一句必须是 `if (remoteApiEnabled) return true;` —— 远端档一个字节都不许落本地盘");
  // 测试名承诺的另一半「不本地推进终态」原先一条断言都没有(缺失轴天然假绿)。
  // advanceTo 是唯一的边界推进入口(poll / convert 共用),远端档必须原样返回快照。
  assert.match(source, /function advanceTo\(now: number\)[^{]*\{\s+if \(remoteApiEnabled\) return snapshot\(\);/,
    "[advance-guard] advanceTo() 的第一句必须是 `if (remoteApiEnabled) return snapshot();` —— 远端档禁止本地推进状态机");
  // 守卫在位 ≠ 绕不过去:落盘口必须唯一,否则在别处新开一条 writeAccountRow 就整条绕过短路。
  assert.equal(source.match(/writeAccountRow[<(]/g)?.length, 1,
    "[single-writer] free-trial 的本地落盘口必须唯一(只有 persist() 内那一次调用);多出来的写盘绕过了远端短路");
  assert.match(source, /authorityStatus/);
  assert.match(source, /refreshInFlightAccount === boundKey/);
  assert.match(source, /reason: "unknown"/);
  const configSource = read("src/store/trial-config.ts");
  assert.match(configSource, /mode !== "mock"/);
  assert.match(configSource, /function reset\(\) \{\s+if \(remoteAuthority\) return;/);
  assert.match(configSource, /device-trial-standard/);
  assert.match(configSource, /TRIAL_PRODUCT_DEVICE_NAMES/);
  assert.match(configSource, /resolveTrialDeviceName/);
  assert.doesNotMatch(configSource, /raw\.trialProductId !== "stellarbox-s1"/);
  const apiSource = read("src/api/trial-api.ts");
  assert.match(apiSource, /start:\s*\(idempotencyKey, deviceName\)/);
  assert.match(apiSource, /body:\s*\{ deviceName \}/);
  const storeSource = read("src/store/free-trial.ts");
  assert.match(storeSource, /resolveTrialDeviceName\(useTrialConfig\(\)\.config\.trialProductId\)/);
  assert.match(storeSource, /trialApi\.start\(pendingStartKey, deviceName\)/);
});
