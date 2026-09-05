// SPEC-7 双端参数 parity · 域锚版(2026-08-15 单独立项,替换死文件字面锚)。
//
// 历史:原门比 uniapp seed ↔ admin `lib/mock/admin/compute-config.ts` 的 defaultVal 字面值。
// 该文件 2026-08-04(admin main 2c477b4)作为死代码进 .trash —— admin 已 server-canonical:
// 前端不再持有参数默认值,字面权威在真后端 DB(nexion-backend,本机无仓)。
// 含全键 defaultVal 的寄存器只活在 admin 非 main 分支,而 wd02 契约锚只在 main 族 ——
// 没有任何 admin 分支能同时喂饱两门,故不复活死文件、不切离 main,改锚 main 活源:
//   · lib/admin/k-client.ts —— riskCluster 11 键 + otpGate 5 键的键集与**允许值域**
//     (K1_RELEASE_PARAM_LIMITS / validateK1ParamValue / validateK2ParamValue 各 if 行)
//   · lib/admin/h-client.ts —— lockMode 白名单(newcomer.lockMode 校验行)
// 语义随之降级并如实改名:字面级「值相等」→「seed ∈ admin 允许值域 + 枚举白名单成员」。
// 抓得住:种子越域 / 枚举串漂移 / admin 收紧值域甩下 uniapp 种子;抓不住:域内字面漂移
// (那份权威已上移真后端,前端两仓谁都不再持有)。恢复字面级 parity 的条件:真后端仓
// 本机可达、或 admin main 恢复声明式默认值锚(照 wd02 家法锚测试文件亦可)。
//
// 纪律(继承原门):任何提取失败(文件缺失/形态漂移/键少了)一律红,禁空集全过。
// 另带升级哨兵:K3 提现前置 / K4 聚簇权重键 main 前端尚未落地(只在 PRD),一旦代表键
// 在 admin lib/admin/ 出现即红 —— 提醒把新落地的域接进本比对,防「未实现登记表」过期假绿。
//
// 用法:node scripts/spec7-admin-domain-parity.mjs <ADMIN_ROOT> "<riskCluster 键清单>" "<otpGate 键清单>"
// 键清单来自 verify.sh 的 SPEC7_RISKCLUSTER_KEYS / SPEC7_OTPGATE_KEYS(单源,勿在此另抄)。
import fs from "node:fs";
import path from "node:path";

const [adminRoot, rcKeysArg, ogKeysArg] = process.argv.slice(2);
if (!adminRoot || !rcKeysArg || !ogKeysArg) {
  console.error("usage: spec7-admin-domain-parity.mjs <ADMIN_ROOT> <riskClusterKeys> <otpGateKeys>");
  process.exit(1);
}
const RC_KEYS = rcKeysArg.trim().split(/\s+/);
const OG_KEYS = ogKeysArg.trim().split(/\s+/);

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log(`ok    ${m}`); };
const bad = (m) => { fail++; console.log(`FAIL  ${m}`); };

// 剥注释(k1-release-params-contract.test.mjs 家法):防注释里的历史值/示例值污染提取
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const read = (p, label) => {
  try { return strip(fs.readFileSync(p, "utf8")); }
  catch { bad(`${label} 读不到:${p}(锚缺失必红,禁静默跳过)`); return null; }
};

const uni = read("src/mock/platform-config.ts", "uniapp 种子");
const kClient = read(path.join(adminRoot, "lib", "admin", "k-client.ts"), "admin k-client");
const hClient = read(path.join(adminRoot, "lib", "admin", "h-client.ts"), "admin h-client");
if (!uni || !kClient || !hClient) {
  console.log(`result: ${pass} pass, ${fail} fail`);
  process.exit(1);
}

// ── uniapp seed 提取(块内逐键,与 verify.sh 覆盖度门同块口径)──────────────
function seedBlock(src, name) {
  const m = src.match(new RegExp(`${name}: \\{([\\s\\S]*?)\\n  \\}`));
  if (!m) { bad(`uniapp 种子块 ${name} 定位失败(形状变了必红)`); return {}; }
  const out = {};
  for (const kv of m[1].matchAll(/(\w+): ("[^"]*"|true|false|-?[\d.]+)/g)) out[kv[1]] = kv[2];
  return out;
}
const seedRc = seedBlock(uni, "riskCluster");
const seedOg = seedBlock(uni, "otpGate");

// ── admin 值域提取 ─────────────────────────────────────────────────────────
// LIMITS 表:`key: { min: X, max: Y, step: Z, integer: B }`
const limits = {};
for (const m of kClient.matchAll(/(\w+): \{ min: (-?[\d.]+), max: (-?[\d.]+), step: [\d.]+, integer: (true|false) \}/g)) {
  limits[m[1]] = { min: +m[2], max: +m[3], integer: m[4] === "true" };
}
// inline 校验:`key === "<lit>"` 出现点之后**首个 return 语句体**(到分号)抓 >= X / <= Y(/ % N)。
// 截到语句边界是必须的:共行键(captchaAfterSends|maxVerifyAttempts)开定长窗会吞到邻行
// otpTtlSeconds 的 `% 60`,把步长约束误挂到别的键上(首跑实锤)。
function inlineDomain(src, keyLiteral) {
  const at = src.indexOf(`key === "${keyLiteral}"`);
  if (at < 0) return null;
  const stmt = src.slice(at, at + 400).match(/return [^;]*/)?.[0];
  if (!stmt) return null;
  const lo = stmt.match(/>=\s*(-?[\d.]+)/), hi = stmt.match(/<=\s*(-?[\d.]+)/);
  if (!lo || !hi) return null;
  return { min: +lo[1], max: +hi[1], multiple: stmt.match(/%\s*(\d+)\s*===\s*0/)?.[1] };
}

// ── riskCluster 11 键:数值 ∈ 域 · releaseMode ∈ 白名单 · 布尔二值 ─────────
const modeList = kClient.match(/K1_RELEASE_MODE_VALUES = \[([^\]]+)\]/)?.[1]?.match(/"[^"]+"/g)?.map((s) => s.slice(1, -1));
for (const k of RC_KEYS) {
  const raw = seedRc[k];
  if (raw == null) { bad(`${k} uniapp 种子缺失(riskCluster 块里没有)`); continue; }
  if (k === "releaseMode") {
    if (!modeList?.length) bad(`releaseMode 白名单 K1_RELEASE_MODE_VALUES 提取失败(形状变了必红)`);
    else if (modeList.includes(raw.replace(/"/g, ""))) ok(`releaseMode seed=${raw} ∈ admin 白名单 [${modeList}]`);
    else bad(`releaseMode seed=${raw} 不在 admin 白名单 [${modeList}]`);
    continue;
  }
  if (k === "freeSlotRequiresBinding") {
    if (!/freeSlotRequiresBinding"\) return value === "true" \|\| value === "false"/.test(kClient)) {
      bad(`freeSlotRequiresBinding admin 二值校验行丢失`);
    } else if (raw === "true" || raw === "false") ok(`freeSlotRequiresBinding seed=${raw} ∈ 二值域`);
    else bad(`freeSlotRequiresBinding seed=${raw} 不是布尔字面`);
    continue;
  }
  const dom = limits[k] ?? inlineDomain(kClient, k);
  if (!dom) { bad(`${k} admin 值域提取失败(LIMITS 表 / validateK1ParamValue 都没抓到 —— 形状变了必红)`); continue; }
  const v = Number(raw);
  if (!Number.isFinite(v)) bad(`${k} seed=${raw} 不是数值,没法进域断言`);
  else if (v < dom.min || v > dom.max) bad(`${k} seed=${v} 越出 admin 允许域 [${dom.min},${dom.max}]`);
  else if (dom.integer && !Number.isInteger(v)) bad(`${k} seed=${v} 应为整数(admin integer 域)`);
  else ok(`${k} seed=${v} ∈ admin 域 [${dom.min},${dom.max}]`);
}

// ── otpGate 5 键:∈ 域(admin 键名带 otpGate. 前缀)────────────────────────
for (const k of OG_KEYS) {
  const raw = seedOg[k];
  if (raw == null) { bad(`otpGate.${k} uniapp 种子缺失`); continue; }
  const dom = inlineDomain(kClient, `otpGate.${k}`);
  if (!dom) { bad(`otpGate.${k} admin 值域提取失败(形状变了必红)`); continue; }
  const v = Number(raw);
  if (!Number.isFinite(v) || v < dom.min || v > dom.max) bad(`otpGate.${k} seed=${raw} 越出 admin 域 [${dom.min},${dom.max}]`);
  else if (dom.multiple && v % +dom.multiple !== 0) bad(`otpGate.${k} seed=${v} 不是 ${dom.multiple} 的倍数(admin 步长域)`);
  else ok(`otpGate.${k} seed=${v} ∈ admin 域 [${dom.min},${dom.max}]${dom.multiple ? ` ∧ %${dom.multiple}=0` : ""}`);
}

// ── lockMode:seed ∈ h-client 白名单(键在 key parity,值锚顺带钉死)────────
{
  const wl = hClient.match(/lockMode !== "(\w+)" && lockMode !== "(\w+)"/);
  const raw = uni.match(/\block(?:Mode): ("[^"]+")/)?.[1];
  if (!wl) bad(`lockMode 白名单提取失败(h-client newcomer.lockMode 校验行形状变了)`);
  else if (!raw) bad(`lockMode uniapp 种子缺失`);
  else if ([wl[1], wl[2]].includes(raw.replace(/"/g, ""))) ok(`lockMode seed=${raw} ∈ admin 白名单 [${wl[1]},${wl[2]}]`);
  else bad(`lockMode seed=${raw} 不在 admin 白名单 [${wl[1]},${wl[2]}]`);
}

// ── 升级哨兵:K3/K4 键 main 前端落地即红(把新域接进比对,别让登记表烂在这)──
// 代表键选无子串冲突的三个(paymentInstrument 会撞 maxAccountsPerPaymentInstrument,不选)。
{
  const SENTINELS = ["weakSignalClusterThreshold", "firstWithdrawalManual", "minWithdrawableUsdt"];
  const libDir = path.join(adminRoot, "lib", "admin");
  let hits = [];
  for (const f of fs.readdirSync(libDir).filter((n) => n.endsWith(".ts"))) {
    const src = fs.readFileSync(path.join(libDir, f), "utf8");
    for (const s of SENTINELS) if (src.includes(s)) hits.push(`${f}:${s}`);
  }
  if (hits.length) bad(`K3/K4 参数已在 admin main 落地(${hits.join(" ")})—— 把该域接进本比对再收哨兵`);
  else ok(`K3/K4 升级哨兵:提现前置/聚簇权重键 main 前端未落地,登记态与现实一致`);
}

console.log(`result: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
