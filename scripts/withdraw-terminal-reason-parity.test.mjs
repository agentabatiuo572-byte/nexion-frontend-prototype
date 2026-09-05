#!/usr/bin/env node
// 提现终态原因码 —— 跨仓 + 跨语言逐值 parity 门。
//
// 守的不变量:同一份「拒绝原因」枚举活在**四个地方**,没有任何一个派生自另一个:
//   1. 运营后台 D2 的「拒绝原因码」下拉  ← 运营真正会选的那份(ground truth)
//   2. 本仓 canonicalTerminalReason 的线上码 case
//   3. 本仓 WithdrawalTerminalReason 的本地码联合类型
//   4. en / zh / vi 三份 withdrawTerminalReasons 文案字典
// 运营在后台加一个原因码而这边不加,用户看到的是兜底话术(不炸,但那条原因永远不显示);
// 反过来这边多一个码则是凭空造了一句服务端永不会发的话。两个方向都必须红。
//
// 🔴 判据必须是「逐值相等」,不是「数量相等」也不是「包含」——
//    键 parity ≠ 值 parity 是本仓记过的坑(feedback_cross_repo_value_parity)。
// 🔴 空集必红:任何一侧解析出 0 个码 = 解析器被上游改动打瞎了,那时「全过」是假绿。
// 🔴 门自证:末尾用篡改过的副本跑一遍比较器,证明它真的会红(没红过的哨兵不算门)。
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * 找真实运营后台仓。历史 checkout 名称是 admin-ops,当前正式仓名是
 * nexion-ops-console；worktree 里相对层级会变化,所以逐级上溯找两者。
 */
function findAdminOps() {
  let dir = ROOT;
  for (let i = 0; i < 6; i++) {
    for (const name of ["nexion-ops-console", "admin-ops"]) {
      const candidate = join(dir, name);
      if (existsSync(join(candidate, "package.json"))) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const D2_RELATIVE = "app/components/domain-views/d-tabs/d2-withdrawals.tsx";

/** 兄弟仓缺席一律判红并交底 —— 缺件不许静默跳门(跳过 ≠ 放宽)。 */
function assertAdminOps() {
  assert.ok(
    adminOps,
    "找不到真实运营后台仓 nexion-ops-console/admin-ops —— 本门的 ground truth 在那边,缺件不许静默跳过。",
  );
  assert.ok(
    existsSync(join(adminOps, D2_RELATIVE)),
    `后台 D2 文件不在预期位置(${D2_RELATIVE})—— 路径漂了就去改本门,别绕过`,
  );
  return adminOps;
}

/** 后台 D2 的拒绝原因码下拉 —— 只取 `key: "reasonCode"` 那个字段的 options。 */
function adminReasonCodes(source) {
  // 锚到 reasonCode 字段本身再取它后面第一个 options 数组:D2 里还有别的 select 字段,
  // 全文抓第一个 `options:` 会抓到别人家的(改判据时最容易犯的错)。
  const at = source.indexOf('key: "reasonCode"');
  if (at < 0) return [];
  // 🔴 只在**这一个字段对象内**找,不许跨到下一个字段(独立审计:原判据只保证「在 reasonCode
  // 之后」,不保证「属于 reasonCode」—— reasonCode 自己哪天不带 options 了,就会静默读到
  // 隔壁 FREEZE 字段的下拉并判绿)。字段以 `{ key: ... }` 成对出现,取到下一个 `key: "` 为止。
  const nextKey = source.indexOf('key: "', at + 6);
  const field = source.slice(at, nextKey < 0 ? source.length : nextKey);
  const match = /options:\s*\[([^\]]+)\]/.exec(field);
  if (!match) return [];
  return [...match[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
}

/** 本仓归一函数认识的线上码(default 分支对应闭集里的 OTHER,单列)。 */
function clientWireCodes(source) {
  const start = source.indexOf("function canonicalTerminalReason");
  assert.notEqual(start, -1, "canonicalTerminalReason 没了 —— 契约归一被删,门的靶不存在");
  // 只截这个函数体:canonicalStatus / canonicalRiskRoute 也全是 case "…",全文扫必串味。
  const body = source.slice(start, source.indexOf("\n}", start));
  const cases = [...body.matchAll(/case\s+"([A-Z_]+)"/g)].map((m) => m[1]);
  // default → "other" 意味着闭集里的 OTHER 由兜底分支承接,不写成 case。
  const hasOtherFallback = /default:\s*\r?\n\s*return "other";/.test(body);
  return { cases, hasOtherFallback };
}

/** 本地码联合类型。 */
function clientLocalCodes(source) {
  const start = source.indexOf("export type WithdrawalTerminalReason");
  assert.notEqual(start, -1, "WithdrawalTerminalReason 类型没了");
  const body = source.slice(start, source.indexOf(";", start));
  return [...body.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
}

/** 某语言 withdrawTerminalReasons 字典的键。 */
function localeKeys(source, locale) {
  const start = source.indexOf("withdrawTerminalReasons: {");
  assert.notEqual(start, -1, `${locale}.ts 缺 withdrawTerminalReasons 块`);
  const body = source.slice(start, source.indexOf("},", start));
  // 键可能带引号(kebab 必须带)也可能裸写(other),两种都收。
  const keys = [...body.matchAll(/(?:"([a-z-]+)"|\b(other))\s*:/g)].map((m) => m[1] ?? m[2]);
  // 🔴 空集必红:解析器被上游格式变动打瞎时,下游的 deepEqual 会红在「内容不对」上,
  // 掩盖真正的病因(判据本身失效)。这一枪让病因直接说出来。
  assert.ok(keys.length > 0, `${locale}.ts 的 withdrawTerminalReasons 解析出 0 个键 —— 判据失效,不是内容问题`);
  return keys;
}

/** 线上码 → 本地码,与 canonicalTerminalReason 同一套映射(小写 + 下划线转连字符)。 */
const toLocal = (wire) => wire.toLowerCase().replaceAll("_", "-");

const adminOps = findAdminOps();
const apiSource = readFileSync(join(ROOT, "src/api/withdrawal-api.ts"), "utf8");
const typesSource = readFileSync(join(ROOT, "src/store/types.ts"), "utf8");

test("终态原因码:后台 D2 下拉 ⇄ 客户端归一函数,逐值相等", () => {
  const adminCodes = adminReasonCodes(readFileSync(join(assertAdminOps(), D2_RELATIVE), "utf8"));
  assert.ok(adminCodes.length > 0, "后台侧解析出 0 个原因码 —— 判据失效,空集全过是假绿");

  const { cases, hasOtherFallback } = clientWireCodes(apiSource);
  assert.ok(hasOtherFallback, "客户端缺 default → other 兜底:后台加新码时会退化成抛异常 → 单据永久卡在途");
  // 客户端认识的全集 = 显式 case + 由 default 承接的 OTHER。
  const clientCodes = [...cases, "OTHER"];

  assert.deepEqual(
    [...clientCodes].sort(),
    [...adminCodes].sort(),
    `原因码漂移 —— 后台 ${JSON.stringify(adminCodes)} vs 客户端 ${JSON.stringify(clientCodes)}`,
  );
});

test("状态码:后台 D2 状态表 ⇄ 客户端 canonicalStatus 闭集,逐值相等", () => {
  // 🔴 本条是「族用一道门根治」的那道门(2026-08-11 独立审计 P0-3)。
  // 上一版只给**原因码**焊了 parity,状态码没焊 —— 于是同一张 D2 表、同一个 switch、
  // 同一条血路上,PENDING 漏了没人知道。漏一个状态码的后果:回读整张单据镜像失败被静默吞
  // (单据永久停在处理中),或建单响应解析抛在入表之前(钱扣了、单号没留下)。
  // 逐个补 case 是打地鼠,判据必须是「两边逐值相等」。
  const d2 = readFileSync(join(assertAdminOps(), D2_RELATIVE), "utf8");
  const table = d2.slice(d2.indexOf("function statusLabel"), d2.indexOf("function statusTone"));
  const adminStatuses = [...table.matchAll(/\b([A-Z][A-Z_]{2,})\s*:\s*"/g)].map((m) => m[1]);
  assert.ok(adminStatuses.length > 0, "后台状态表解析出 0 个码 —— 判据失效,空集全过是假绿");

  const body = apiSource.slice(
    apiSource.indexOf("function canonicalStatus"),
    apiSource.indexOf("function canonicalRiskRoute"),
  );
  assert.ok(body.length > 0, "canonicalStatus 没找到 —— 门的靶不存在");
  const clientStatuses = [...body.matchAll(/case\s+"([A-Z_]+)"/g)].map((m) => m[1]);

  const missing = adminStatuses.filter((s) => !clientStatuses.includes(s));
  const extra = clientStatuses.filter((s) => !adminStatuses.includes(s));
  assert.deepEqual(
    { missing, extra },
    { missing: [], extra: [] },
    "状态码漂移 —— missing = 后台会发但客户端一律抛协议错(单据永久卡住);extra = 客户端认一个服务端不会发的码",
  );
});

test("终态原因码:线上码 ⇄ 本地联合类型 ⇄ 三语文案,逐值相等", () => {
  const { cases } = clientWireCodes(apiSource);
  const expectedLocal = [...cases, "OTHER"].map(toLocal).sort();

  assert.deepEqual(clientLocalCodes(typesSource).sort(), expectedLocal, "本地联合类型与线上码不齐");

  for (const locale of ["en", "zh", "vi"]) {
    const keys = localeKeys(readFileSync(join(ROOT, `src/i18n/messages/${locale}.ts`), "utf8"), locale).sort();
    assert.deepEqual(
      keys,
      expectedLocal,
      `${locale} 文案字典与码表不齐 —— 少一条 = 那个原因在该语言下永远显示兜底话术`,
    );
  }
});

test("接线 runtime 门必须还挂在 verify 链上(防它变成孤儿)", () => {
  // withdraw-status-mirror-runtime.mjs 不是 *.test.mjs,不受 run-contract-suite 的
  // 登记制度约束 —— 谁把它从 package.json 摘掉,没有任何东西会红,而它守的正是
  // 「调用点被摘掉」那一刀。所以把「它还在链上」这件事本身,焊进一条**受登记约束**的测试里。
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const gate = "scripts/withdraw-status-mirror-runtime.mjs";
  assert.ok(existsSync(join(ROOT, gate)), `${gate} 不见了 —— 接线门被删,提现回读又回到无人可达性守卫的状态`);
  assert.match(
    pkg.scripts["test:withdraw-status-mirror"] ?? "",
    /withdraw-status-mirror-runtime\.mjs/,
    "test:withdraw-status-mirror 脚本不见了或不再指向那道门",
  );
  assert.match(
    pkg.scripts["verify:steps"] ?? "",
    /npm run test:withdraw-status-mirror\b/,
    "verify:steps 链里没有 test:withdraw-status-mirror —— 门还在文件系统上,但没人会跑它(孤儿门;npm run verify 由 verify-chain.mjs 按 verify:steps 执行)",
  );
});

test("门自证:比较器对篡改过的输入必须报错(没红过的哨兵不算门)", () => {
  // 用同一套解析器读一份**被改坏**的源码副本:少一个码 / 拿掉兜底,两向都要炸。
  // 🔴 样本一律用 `\r?\n` 匹配:本仓源文件是 CRLF,写死 `\n` 的样本永远替换不中,
  // 于是「红测通过」变成「红测根本没跑」(本门首跑就撞到了这个,PITFALLS 有案)。
  const dropped = apiSource.replace(/case "DATA_MISMATCH":\s*\r?\n\s*return "data-mismatch";\s*\r?\n/, "");
  assert.ok(dropped !== apiSource, "红测样本没造出来(上游源码格式变了),本自证已失效");
  assert.ok(
    !clientWireCodes(dropped).cases.includes("DATA_MISMATCH"),
    "删掉一个 case 后解析器仍报告它存在 —— 解析器在骗人,真漂移也抓不到",
  );

  const noFallback = apiSource.replace(/default:\s*\r?\n\s*return "other";/, 'default:\n      return "risk-hit";');
  assert.ok(noFallback !== apiSource, "兜底红测样本没造出来");
  assert.equal(clientWireCodes(noFallback).hasOtherFallback, false, "兜底被换掉后仍判 true —— 该判据是摆设");

  const strayLocale = '{ withdrawTerminalReasons: {\n"risk-hit": "x",\n},';
  assert.deepEqual(localeKeys(strayLocale, "probe"), ["risk-hit"], "语言字典解析器读不出键,前两条断言等于空跑");

  // 状态 parity 的自证:把 PENDING 那一 case 拿掉,比较器必须看见它少了。
  // (PENDING 正是 2026-08-11 独立审计抓到的那一个 —— 焊门之前它漏了没有任何东西变红。)
  const noPending = apiSource.replace(/case "PENDING":\s*\r?\n\s*return "submitted";/, 'return "submitted";');
  assert.ok(noPending !== apiSource, "状态红测样本没造出来(上游源码格式变了),本自证已失效");
  const shrunk = noPending.slice(
    noPending.indexOf("function canonicalStatus"),
    noPending.indexOf("function canonicalRiskRoute"),
  );
  assert.ok(
    ![...shrunk.matchAll(/case\s+"([A-Z_]+)"/g)].map((m) => m[1]).includes("PENDING"),
    "删掉 PENDING 后状态解析器仍报告它存在 —— 状态 parity 是摆设",
  );
});
