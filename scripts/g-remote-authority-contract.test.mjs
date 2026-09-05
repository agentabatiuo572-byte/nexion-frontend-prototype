import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { namespaceBlock } from "./lib/i18n-namespace.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

/** 按大括号配对抠出某个顶层 i18n 命名空间的正文;抠不到就抛,不返回空串(空集会让断言全过)。 */
// 🔴 2026-08-17 起搬到 `scripts/lib/i18n-namespace.mjs`,与 social-facts-authority-contract 共用一份
//(那边同日也要按命名空间锚 i18n key)。留在这里让另一处复制 = 「修了一道门、漏了另一道」。
//    本文件下面那两条「按命名空间取值,不许整文件子串匹配」的断言就是共享模块的回归靶。

test("G1 remote mode consumes the server staking authority and fails closed", () => {
  const source = read("src/store/staking.ts");
  assert.match(source, /import\s*\{[^}]*stakingApi[^}]*remoteApiEnabled[^}]*\}\s*from\s*["']@\/api\/runtime["']/);
  assert.match(source, /async function syncRemote\(/);
  assert.match(source, /function clearRemoteState\(/);
  assert.match(source, /stakingApi\.fetchStakingPools\(\)/);
  assert.match(source, /stakingApi\.fetchStakingPositions\(\)/);
  assert.match(source, /catch \{[\s\S]*clearRemoteState\(\)/);
  assert.match(source, /isMockMode/);
});

test("G2 remote mode never records a local wallet success", () => {
  const source = read("src/pages/me/wallet-exchange.vue");
  assert.match(source, /import\s*\{[^}]*exchangeApi[^}]*remoteApiEnabled[^}]*\}\s*from\s*["']@\/api\/runtime["']/);
  assert.match(source, /async function syncRemoteState\(/);
  assert.match(source, /await exchangeApi\.fetchState\(\)/);
  assert.match(source, /await executeExchangeSwap<ExchangeSnapshot>\(/);
  assert.match(source, /swap:\s*\(idempotencyKey\)\s*=>\s*exchangeApi\.swap\(/);
  assert.match(source, /fetchState:\s*\(\)\s*=>\s*exchangeApi\.fetchState\(\)/);
  assert.match(source, /remoteState\.value = null/);
  // 判据锚在 **i18n key** 上,不锚中文字面量:页面文案 2026-08-10 收进 src/i18n(硬编码中文
  // 哨兵 scripts/i18n-hardcoded-cjk-sentinel.mjs 要求 .vue 里不得出现中文),锚字面量会让
  // 这道门与那道门方向相反 —— 任何源码状态都不可能同时绿。
  // 🔴 key 名收尾必须带边界:不带的话 `remoteNotProvidedXX` 这种笔误 key 照样匹配,
  //    页面渲染空白而门报绿(红测实测出来的洞)。
  assert.match(source, /t\.exchange\.remoteUnavailableClosed\b(?!\w)/);
  assert.match(source, /remoteState\.value\?\.orders/);
  // 🔴 判据必须锚**行为**,不能锚注释:原本这里只断言「那句注释还在不在」,红测实测把
  //    displayUserUsed 改成直接渲染本地持久计数、注释原样留着 —— 四道门全绿。
  //    逐个锚住四个展示派生值的 `remoteApiEnabled ? 远端值 : 本地值` 形状。
  for (const derived of ["displayUserUsed", "displayPlatformUsed", "displayUserCap", "displayPlatformCap"]) {
    assert.match(
      source,
      new RegExp(`const ${derived} = computed\\(\\(\\) => remoteApiEnabled \\? \\(?remoteState\\.value\\?\\.`),
      `${derived} 必须在远端模式下只读 remoteState —— 远端模式渲染本地持久事实会把 stale 额度当权威值展示`,
    );
  }
  assert.match(source, /t\.exchange\.remoteNotProvided\b(?!\w)/);
  // 锚 key 就必须同时锚「key 有值」,否则指向一个不存在的键也能绿(悬空 key = 页面渲染空白)。
  // 🔴 必须**按命名空间取值**,不能对整份词典做子串匹配:remoteUnavailableClosed 在 exchange
  //    与 staking 两个命名空间里都存在,整文件匹配时把 exchange 那条清成空串,staking 那条会
  //    替它满足断言 —— 独立审计红测实测「四道门同时绿而横幅渲染空白」。
  for (const locale of ["en", "zh", "vi"]) {
    const dict = read(`src/i18n/messages/${locale}.ts`);
    const ns = namespaceBlock(dict, "exchange");
    for (const key of ["remoteUnavailableClosed", "remoteNotProvided"]) {
      assert.match(ns, new RegExp(`\\b${key}:\\s*"[^"]+"`), `${locale}.ts 的 exchange 命名空间缺 ${key} 或值为空`);
    }
  }
  const remoteCommand = source.indexOf("if (remoteApiEnabled) {", source.indexOf("async function handleConfirm"));
  const localGate = source.indexOf("v3.canExchange", source.indexOf("async function handleConfirm"));
  assert.ok(remoteCommand >= 0 && remoteCommand < localGate, "remote command must precede the local v3 gate");
});

test("G1 remote mutations use instance pending locks, stable keys and authority read-back", () => {
  const sheet = read("src/components/staking/stake-sheet.vue");
  const page = read("src/pages/staking/staking.vue");
  assert.match(sheet, /const remotePending = ref\(false\)/);
  assert.match(sheet, /const remoteIntent = ref/);
  assert.match(sheet, /if \(remotePending\.value\) return/);
  assert.match(sheet, /staking\.syncRemote\(\)/);
  assert.match(page, /const pendingRemoteMutations = ref/);
  assert.match(page, /if \(pendingRemoteMutations\.value\.has\(intent\)\) return/);
  assert.match(page, /await staking\.syncRemote\(\)/);
  assert.match(sheet, /intentKey\(.*tierKey.*amount/);
  assert.match(page, /intentKey\(.*positionNo/);
  assert.match(sheet, /fingerprint = `\$\{tierKey\}:\$\{amountUsdt\.toFixed\(2\)\}`/);
  assert.match(page, /remoteMutationKeys\.get\(intent\)/);
});

test("G3 remote mode uses only the canonical market snapshot and clears stale facts", () => {
  const source = read("src/store/market.ts");
  assert.match(source, /import\s*\{[^}]*marketApi[^}]*remoteApiEnabled[^}]*\}\s*from\s*["']@\/api\/runtime["']/);
  assert.match(source, /async function syncRemote\(/);
  assert.match(source, /await marketApi\.fetch\(\)/);
  assert.match(source, /function clearRemoteState\(/);
  assert.match(source, /catch \{[\s\S]*clearRemoteState\(\)/);
  assert.match(source, /isMockMode/);
});
