// Device daily-yield single-source parity gate.
//
// The same per-SKU daily yield (USDT + NEX) is hand-duplicated across FOUR
// sources, with nothing deriving one from another:
//   1. src/store/device-types.ts   DEVICE_SPECS[kind].baseRate / baseRateNEX
//        → drives the live earning fleet — what the user ACTUALLY earns (delivered)
//   2. src/mock/products.ts         PRODUCTS[id].dailyEarn / dailyEarnNEX
//        → drives the store card + detail page — what is ADVERTISED
//   3. src/i18n/messages/{en,zh}.ts vsNexPerDay / vsS1NexPerDay
//        → VsPhoneHero NEX sublines (hardcoded copy, phone + S1)
//   4. src/store/trial-config.ts    shadowDailyUSD / shadowDailyNEX
//        → free-trial shadow accrual — what the trial ADVERTISES it earns
//          (must equal the trialProductId device baseline, currently S1 7/40)
//
// On 2026-06-18 these drifted (phone 2≠10, Cloud 1≠3, Pro v2 14.5/100≠14/90):
// advertised ≠ delivered — a silent "宣传≠实发" trust bug that NONE of the 22
// existing verify sentinels caught (it was fixed only by manual回源). This gate
// asserts the three agree so the class can't recur unnoticed.
//
// It enforces INTERNAL consistency only. The authoritative values live in
// PRD §7.1/§13.3 (phone 10 / Cloud 3 / S1 40 / Pro 80 / Pro v2 14·90 / Rack
// P1 300 / Rack P2 500). Optional argv[2] = root override (negative-probe / CI).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] || join(SELF_DIR, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const dt = read("src/store/device-types.ts");
const pr = read("src/mock/products.ts");
const en = read("src/i18n/messages/en.ts");
const zh = read("src/i18n/messages/zh.ts");
// 🔴 vi 一并锚(2026-08-05 元门抓的语言缺面):本门 2026-06 双语时代写就,vi 上线后没扩 ——
//   vi 文案里的日产数字漂了没人看得见,而 vi 是主人验收面之一。键奇偶归 mirror 门管,
//   **数值奇偶**必须逐语言锚。
const vi = read("src/i18n/messages/vi.ts");
const tc = read("src/store/trial-config.ts");

// 🔴 舰队∩商城的 SKU 集合**从 DEVICE_SPECS 派生,不手写**(2026-08-05 元门抓的第一批):
//   手写 6 条时新增 SKU 两边都不会红 —— 「广告价 ≠ 实付价」的漂移对新机型整个失守。
//   派生后:DEVICE_SPECS 加一个 SKU → 它自动进 SHARED → 商城没同步加就当场红。
//   排除清单是**定点引用**(各带理由),不是集合枚举;完备性由下面的断言钉住。
const DEVICE_ONLY = {
  phone: "只在舰队不进商城;its 日产由 i18n 副行(vsNexPerDay)单独锚,见下",
  "pc-gpu": "用户自有电脑,按档位表分成,无固定日产档,商城不售",
};
const specsBlock = dt.slice(dt.indexOf("DEVICE_SPECS"), dt.indexOf("\n};", dt.indexOf("DEVICE_SPECS")));
const FLEET_KINDS = [...specsBlock.matchAll(/^\s*["']?([a-z][a-z0-9-]*)["']?:\s*\{\s*name:/gm)].map((m) => m[1]);
const SHARED = FLEET_KINDS.filter((k) => !(k in DEVICE_ONLY));
const errs = [];
// 派生自证:解析缩集必炸(候选=0/缩集全过是已知假绿形态);排除项必须真实存在于舰队。
if (FLEET_KINDS.length < 8) errs.push(`DEVICE_SPECS 解析异常:只认出 ${FLEET_KINDS.length} 个机型(${FLEET_KINDS.join(",")})`);
for (const k of Object.keys(DEVICE_ONLY)) {
  if (!FLEET_KINDS.includes(k)) errs.push(`DEVICE_ONLY 排除项 "${k}" 不在 DEVICE_SPECS 里(改名了?排除清单跟着失效)`);
}

// ── device specs: each kind is a single { … } line in DEVICE_SPECS ──
// `baseRate:` matches the USDT field, not `baseRateNEX:` (that has NEX before
// the colon). `["']?key["']?:` only matches the exact key (stellarbox-pro does
// NOT match inside stellarbox-pro-v2 — the `-v2` breaks the `["']?:` tail).
function deviceSpec(kind) {
  const m = dt.match(new RegExp(`["']?${kind}["']?:\\s*\\{([^}]*)\\}`));
  if (!m) {
    errs.push(`device-types: spec for "${kind}" not found (renamed?)`);
    return null;
  }
  const rate = m[1].match(/baseRate:\s*([0-9.]+)/);
  const nex = m[1].match(/baseRateNEX:\s*([0-9.]+)/);
  return { rate: rate ? +rate[1] : NaN, nex: nex ? +nex[1] : NaN };
}

// ── products: array of multi-line objects (nested `ai: {}`), so slice per id
// and extract the two fields from that bounded window. The id literal carries
// its closing quote so "stellarbox-pro" won't match "stellarbox-pro-v2". ──
function productSpec(id) {
  const start = pr.indexOf(`id: "${id}"`);
  if (start < 0) {
    errs.push(`products: "${id}" not found (renamed?)`);
    return null;
  }
  const next = pr.indexOf(`id: "`, start + 5);
  const body = pr.slice(start, next < 0 ? undefined : next);
  const rate = body.match(/dailyEarn:\s*([0-9.]+)/);
  const nex = body.match(/dailyEarnNEX:\s*([0-9.]+)/);
  return { rate: rate ? +rate[1] : NaN, nex: nex ? +nex[1] : NaN };
}

for (const id of SHARED) {
  const d = deviceSpec(id);
  const p = productSpec(id);
  if (!d || !p) continue;
  if (d.rate !== p.rate) errs.push(`${id}: USDT/day device ${d.rate} ≠ product ${p.rate}`);
  if (d.nex !== p.nex) errs.push(`${id}: NEX/day device ${d.nex} ≠ product ${p.nex}`);
}

// ── i18n VsPhoneHero NEX sublines vs device baseRateNEX (phone + S1) ──
const phone = deviceSpec("phone");
const s1 = deviceSpec("stellarbox-s1");
const i18nNum = (src, key) => {
  const m = src.match(new RegExp(`${key}:\\s*"\\+?\\s*([0-9.]+)`));
  return m ? +m[1] : NaN;
};
for (const [label, src] of [["en", en], ["zh", zh], ["vi", vi]]) {
  if (phone) {
    const v = i18nNum(src, "vsNexPerDay");
    if (v !== phone.nex) errs.push(`i18n ${label}: vsNexPerDay ${v} ≠ phone baseRateNEX ${phone.nex}`);
  }
  if (s1) {
    const v = i18nNum(src, "vsS1NexPerDay");
    if (v !== s1.nex) errs.push(`i18n ${label}: vsS1NexPerDay ${v} ≠ S1 baseRateNEX ${s1.nex}`);
  }
}

// ── trial shadow accrual vs its trialProductId device baseline ──
// Parse from DEFAULT_TRIAL_CONFIG (the interface block declares `: number` /
// `: "stellarbox-s1"` types, no concrete digits, so the numeric regexes only
// hit the default object anyway — slicing keeps trialProductId unambiguous).
const def = tc.slice(Math.max(0, tc.indexOf("DEFAULT_TRIAL_CONFIG")));
const trialId = (def.match(/trialProductId:\s*"([^"]+)"/) || [])[1];
const shadowUSD = (def.match(/shadowDailyUSD:\s*([0-9.]+)/) || [])[1];
const shadowNEX = (def.match(/shadowDailyNEX:\s*([0-9.]+)/) || [])[1];
if (!trialId || shadowUSD === undefined || shadowNEX === undefined) {
  errs.push("trial-config: trialProductId / shadowDailyUSD / shadowDailyNEX not found (renamed?)");
} else {
  const td = deviceSpec(trialId);
  if (td) {
    if (+shadowUSD !== td.rate) errs.push(`trial-config: shadowDailyUSD ${+shadowUSD} ≠ ${trialId} baseRate ${td.rate}`);
    if (+shadowNEX !== td.nex) errs.push(`trial-config: shadowDailyNEX ${+shadowNEX} ≠ ${trialId} baseRateNEX ${td.nex}`);
  }
}

if (errs.length) {
  console.error("device-yield parity FAIL (advertised ≠ delivered drift):\n  " + errs.join("\n  "));
  process.exit(1);
}
console.log(
  `device-yield parity OK (${SHARED.length} SKUs 派生自 DEVICE_SPECS(共 ${FLEET_KINDS.length} 机型 − ${Object.keys(DEVICE_ONLY).length} 定点排除) × USDT+NEX + i18n phone/S1 sublines en+zh+vi + trial shadow vs ${trialId})`,
);
