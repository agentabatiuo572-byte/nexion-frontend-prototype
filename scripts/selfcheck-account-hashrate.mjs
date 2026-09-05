#!/usr/bin/env node
// 账号总有效算力(myTotalHashrate)聚合的行为门(规格 FEAT-HOME02 ③)— node 直跑:
//   node scripts/selfcheck-account-hashrate.mjs
//
// 守四件事,前三件是规格对这个入参的定义,第四件是它凭什么可信:
//   ① **多台求和**:总算力 = 每台有效算力之和(不是只取一台、不是取平均、不是重复计)。
//   ② **未激活不计**:activatedAt === null 的设备一台都不许进和。
//   ③ **不在产不计 / 无设备为 0**:参照系 = settleDevice 那张不结算清单,它实际是
//      **5 条**(store/app.ts:234-240:未激活 / status 非 online / cloud-share /
//      pausedReason 非空 / 手机未充电或无 WiFi)。排名的在产判据只取其中 3 条
//      (未激活 / 非 online / pausedReason),差出来的两条是**刻意取舍**,别当 bug 修:
//      · cloud-share:收益另路、算力在网(排名照算 G2 兜底 90);
//      · 手机不充电:结算给 $0,排名照算打折正数(charge 0.6,28.3 标定实测 16.5)——
//        与设备卡显示自洽,展示≠结算;断网那半条由既有模型 network 因子归 0。
//      🔴 **心跳过期 ≠ 不在产**:H5 上没有常驻
//      App 心跳的手机照样按 hosted 档真给钱、设备卡照样显示 TOPS,排名里必须同样有数,
//      判成 0 就会对一个正在赚钱的用户说「未上榜,激活设备就上榜」。
//      空舰队返回数字 0(**不返回 null**,「未上榜」是 lib/network-rank.ts 的三态)。
//   ④ **口径复用 + 独立锚**:手机那一台必须等于既有模型 computeLiveHashpower 的输出;
//      非手机那一台必须等于「设备自己那行 GPU 规格串解出来的 TOPS」——
//      🔴 期望值一律**写死成字面数字**,不经过被测函数。上一版这条是自指的
//      (期望值也拿 deviceBaselineTops 现算),把天花板整体 ×2 仍 35 pass / 0 fail。
//
// 🔴 外加两条**时间不变**:
//   · 同一批设备在 now / now+1s / now+30s 必须**全等**。既有单台模型里有一个随时间
//     摆动的 jitter(展示用的呼吸感),它一旦流进排名,名次会每秒抖、还会倒退。
//   · 同一台设备,持有 1 天与持有 400 天必须**全等**(逐机型都验)。device-lifecycle 的
//     `getEfficiency` 降的**不是算力**——平台语义里硬件算力恒定,递减的是它能接到的
//     **任务量**(档位表叫 TASK_CAPACITY_BANDS,后台开关叫「参与任务递减」),它乘的是
//     baseRate(USD/日),是「钱」那一侧。把它乘进算力是语义错,后果是「用户什么都不做
//     名次也往后掉」,规格阳光路径4 当场失效;顺带钉住 CAPACITY_EXEMPT_KINDS ——
//     递减套错机型(cloud-share/pc-gpu 也跟着降)在上一版是看不见的,因为它们降完仍 > 0。
//
// 方法:esbuild 载**真模块**跑真函数,设备也用真工厂 createDevice 造(不手搓 mock 对象,
// 否则字段形状一漂,门还在绿)。uni 存储 API 在 node 里没有,给一个最小 stub。
import { build } from "esbuild";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { atAliasResolver } from "./lib/at-alias.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");

// uni 端 API 的最小 stub —— 只为让真工厂在 node 里跑起来(缓存永远 miss → 走 fallback 标定)。
globalThis.uni = {
  getStorageSync: () => "",
  setStorageSync: () => {},
  removeStorageSync: () => {},
  getSystemInfoSync: () => ({}),
};

const bundle = await build({
  stdin: {
    contents: `
      export { accountTotalHashrate, deviceEffectiveTops, deviceBaselineTops } from "@/lib/account-hashrate";
      export { computeLiveHashpower } from "@/lib/hashpower";
      export { GPU_TIERS } from "@/lib/gpu-tiers";
      export { createDevice, makeInitialDevices, DEVICE_SPECS } from "@/store/device-types";
      export { CAPACITY_EXEMPT_KINDS } from "@/store/device-lifecycle";
      export { computeRank, isValidPercentileTable } from "@/lib/network-rank";
      export { publicStatsHealth } from "@/lib/platform-stats";
      export { completePlatformConfigSeed } from "@/lib/platform-config-compat";
      export { DEFAULT_PLATFORM_CONFIG } from "@/mock/platform-config";
    `,
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "esm",
  plugins: [{ name: "alias", setup(b) { b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "selfcheck-account-hashrate")); } }],
});
const {
  accountTotalHashrate, deviceEffectiveTops, deviceBaselineTops,
  computeLiveHashpower, GPU_TIERS, createDevice, makeInitialDevices,
  DEVICE_SPECS, CAPACITY_EXEMPT_KINDS, computeRank, isValidPercentileTable,
  completePlatformConfigSeed, DEFAULT_PLATFORM_CONFIG, publicStatsHealth,
} = await import("data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text, "utf8").toString("base64"));

let pass = 0;
let fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

console.log("selfcheck-account-hashrate — 账号总有效算力聚合");

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 7, 5, 12, 0, 0); // 固定时刻:判据不许依赖真实时钟
const BONUS = { h5BaseFactor: 0.6, continuityFullHours: 2 };
// 档位表默认给种子常量(与种子配置 computeShare.gpuTiers 同一对象);
// 「真读配置」的行为靶在下方用**改过的表**单独验,不在这里混。
const total = (devices, now = NOW, tiers = GPU_TIERS) => accountTotalHashrate(devices, now, BONUS, tiers);
const one = (device, now = NOW, tiers = GPU_TIERS) => deviceEffectiveTops(device, now, BONUS, tiers);
const ceiling = (device) => deviceBaselineTops(device, GPU_TIERS);

/** 真工厂造的手机,再钉死运行态(在产 + 连续在线满档,免得判据踩到工厂里的 Date.now())。 */
function phone(tops, over = {}) {
  return {
    ...createDevice("phone", `phone-${tops}`),
    capabilityTops: tops,
    purchasedAt: NOW - 30 * DAY,
    activatedAt: NOW - 30 * DAY,
    status: "online",
    onlineHeartbeatAt: NOW,       // App 常驻心跳新鲜 = 在线
    isCharging: true,
    isWifiConnected: true,
    thermalState: "nominal",
    miningSince: NOW - 10 * HOUR, // 连续在线加成已满
    pausedReason: null,
    ...over,
  };
}
/** 真工厂造的托管硬件 / 云算力。 */
function hw(kind, over = {}) {
  return {
    ...createDevice(kind, `${kind}-fix`),
    purchasedAt: NOW - 60 * DAY,
    activatedAt: NOW - 60 * DAY,
    status: "online",
    ...over,
  };
}

// ── ① 多台求和 ─────────────────────────────────────────────────────────────
{
  // 期望值不走被测函数:直接问既有单台模型要两台的数,再自己加。
  const live = (tops) => computeLiveHashpower({
    baselineTops: tops, online: true, isCharging: true, isOnline: true,
    thermalState: "nominal", continuityMs: 10 * HOUR, nowSeed: 0, onlineBonus: BONUS,
  }).effectiveTops;

  const p30 = phone(30);
  const p20 = phone(20);
  check("① 两台手机求和 = 既有模型两次输出之和(不是只取一台/取平均)",
    near(total([p30, p20]), live(30) + live(20), 1e-6),
    `得到 ${total([p30, p20])},期望 ${live(30) + live(20)}`);
  check("① 判据不空转:两台的贡献本来就不相等(否则求和/取一台看不出差别)",
    !near(live(30), live(20)), `两台都算出 ${live(30)}`);

  const fleet = [p30, hw("stellarbox-s1"), hw("cloud-share")];
  check("① 混合舰队求和 = 逐台之和(手机 + 托管硬件 + 云算力都在和里)",
    near(total(fleet), fleet.reduce((s, d) => s + one(d), 0), 1e-9),
    `总 ${total(fleet)} vs 逐台 ${fleet.reduce((s, d) => s + one(d), 0)}`);
  check("① 每一类设备都真有正贡献(某一类被静默漏掉时这条红)",
    fleet.every((d) => one(d) > 0), fleet.map((d) => `${d.kind}=${one(d)}`).join(" | "));
  check("① 加一台设备,总算力只增不减(排名单调的地基)",
    total([p30, p20]) > total([p30]), `${total([p30, p20])} vs ${total([p30])}`);
}

// ── ② 未激活不计 ───────────────────────────────────────────────────────────
{
  const active = phone(30);
  const idle = phone(40, { activatedAt: null });
  check("② 未激活设备单台算 0", one(idle) === 0, `得到 ${one(idle)}`);
  check("② 未激活设备不进和(哪怕它算力更高)",
    near(total([active, idle]), total([active]), 1e-9),
    `含未激活 ${total([active, idle])} vs 只算已激活 ${total([active])}`);
  check("② 全部未激活 → 0", total([idle, hw("stellarbox-pro", { activatedAt: null })]) === 0);
}

// ── ③ 不在产不计 / 无设备为 0 ──────────────────────────────────────────────
{
  const active = phone(30);
  check("③ 硬件 status=offline → 0", one(hw("stellarbox-s1", { status: "offline" })) === 0);
  check("③ 手机 status=offline → 0", one(phone(30, { status: "offline" })) === 0);
  check("③ 手机被 tick 挂起(pausedReason 非空,拔电/断网)→ 0",
    one(phone(30, { pausedReason: "no-charger" })) === 0);
  check("③ 硬件被挂起(pausedReason 非空)→ 0",
    one(hw("stellarbox-s1", { pausedReason: "no-network" })) === 0);
  check("③ 离线设备不进和",
    near(total([active, hw("stellarrack-p1", { status: "offline" })]), total([active]), 1e-9));
  check("③ 无设备 → 0", total([]) === 0, `得到 ${total([])}`);
  check("🔴 ③ 无设备返回的是数字 0,不是 null/undefined(「未上榜」不在这层判)",
    typeof total([]) === "number" && Number.isFinite(total([])));
  check("③ 设备数据坏了(capabilityTops 非数)按 0 计,不把 NaN 传下去",
    Number.isFinite(total([active, phone(Number.NaN)]))
      && near(total([active, phone(Number.NaN)]), total([active]), 1e-9));

  // 🔴 P1-4:心跳过期的手机**不是**「不在产」。它在 settleDevice 那张清单之外
  //   (照样按 h5BaseFactor 计息),设备卡也照样给它一个跳动的 TOPS ——
  //   排名判它 0,首页就会对着一个正在赚钱的用户说「未上榜,激活设备就上榜」。
  const staleBeat = phone(30, { onlineHeartbeatAt: NOW - 10 * 60_000 });
  const hostedExpected = computeLiveHashpower({
    baselineTops: 30, online: false, isCharging: true, isOnline: true,
    thermalState: "nominal", continuityMs: 10 * HOUR, nowSeed: 0, onlineBonus: BONUS,
  }).effectiveTops;
  check("🔴 ③ 心跳过期的手机(H5 / App 被杀)贡献 > 0,不是被判成不在产",
    one(staleBeat) > 0, `得到 ${one(staleBeat)}`);
  check("🔴 ③ 心跳过期的手机 = 设备卡那次 computeLiveHashpower(online:false)的输出(hosted 档)",
    near(one(staleBeat), hostedExpected, 1e-9), `得到 ${one(staleBeat)},既有模型给 ${hostedExpected}`);
  check("③ 判据不空转:hosted 档确实低于心跳新鲜时的满档(两档没拉开就看不出套错档)",
    hostedExpected < one(phone(30)), `hosted ${hostedExpected} vs 满档 ${one(phone(30))}`);
}

// ── ④ 口径复用:不许在聚合层另写算力公式 ───────────────────────────────────
{
  const p = phone(33.3);
  const expected = computeLiveHashpower({
    baselineTops: 33.3, online: true, isCharging: true, isOnline: true,
    thermalState: "nominal", continuityMs: 10 * HOUR, nowSeed: 0, onlineBonus: BONUS,
  }).effectiveTops;
  check("🔴 ④ 手机单台 = computeLiveHashpower 的输出(改成自己算就红)",
    near(one(p), expected, 1e-9), `得到 ${one(p)},既有模型给 ${expected}`);
  check("④ 手机天花板取标定值 capabilityTops,不走日产反推",
    ceiling(p) === 33.3, `得到 ${ceiling(p)}`);
  check("④ 手机不充电时贡献下降(条件因子真的生效,不是拿天花板直接求和)",
    one(phone(30, { isCharging: false })) < one(phone(30)) && one(phone(30, { isCharging: false })) > 0);
  check("④ 手机断网时贡献为 0(既有模型的 network 因子)",
    one(phone(30, { isWifiConnected: false })) === 0);

  // 🔴 P1-5 独立锚:期望值是**写死的数字**,一个都不经过被测函数。
  //   上一版拿 deviceBaselineTops 自己算期望值 —— 天花板错多少两边同步错多少,判据恒真
  //   (实测把它整体 ×2,门仍 35 pass / 0 fail)。
  //   数字怎么来的:设备自己那行 GPU 规格串(store/device-types.ts DEVICE_SPECS.gpu)
  //   写明的张数 × lib/gpu-tiers.ts 里该型号所属档位的 tops。改档位表或改规格串 → 这里
  //   必须同步改,红是设计不是噪音。
  //   ⚠️ 4 个 SKU 并列在 5280:GPU_TIERS 最高档 G6 把 RTX 4090 / RTX 5090 / A100 / H100
  //   收在同一档(660),映射覆盖不到数据中心卡之间的差异。今天不外露(分位表 96% 封顶,
  //   所有硬件持有者本来就同名次);分位表抬档前必须先给 G6 以上补档,否则会出现
  //   「买 $7,499 的机架名次不动」。
  const HW_CEILING_TOPS = {
    "stellarbox-s1": 2640,     // "4× RTX 4090"     = 4 × G6 660
    "stellarbox-pro": 5280,    // "8× RTX 4090"     = 8 × G6 660
    "stellarbox-pro-v2": 5280, // "8× RTX 5090"     = 8 × G6 660
    "stellarrack-p1": 5280,    // "8× NVIDIA A100"  = 8 × G6 660
    "stellarrack-p2": 5280,    // "8× NVIDIA H100"  = 8 × G6 660
    "cloud-share": 90,         // "Distributed" 无型号关键词 → matchGpuTier 自带的 G2 兜底
  };
  // 🔴 台账完备性(2026-08-05 结构轮,B2 红测靶):台账键集必须 = 全机型 − 逐台天花板 2 类,
  //   全集从真模块导出取、不抄清单。上一版是手写 6 条闭集 —— 加一个 SKU,门照样全绿放行,
  //   而该 SKU 的型号串若不在档位表里会静默按兜底档 90 计入排名,排序当场倒挂(证伪 B2 实测)。
  //   派生后:DEVICE_SPECS 一变大,这条当场红,失败信息直接点名缺谁。
  const PER_DEVICE_CEILING = {
    phone: "天花板 = 每台自己的 capabilityTops,无机型级常数;由 ①/② 组手机 fixtures 独立锚",
    "pc-gpu": "天花板 = 所属 GPU 档位,无机型级常数;逐档自证循环在下方",
  };
  const ALL_KINDS = Object.keys(DEVICE_SPECS).sort();
  const LEDGER_EXPECTED = ALL_KINDS.filter((k) => !(k in PER_DEVICE_CEILING));
  const ledgerKeys = Object.keys(HW_CEILING_TOPS).sort();
  check("🔴 ④ 天花板台账覆盖 = 全机型 −(逐台天花板 2 类)—— 新增 SKU 必到这里报到",
    ledgerKeys.length === LEDGER_EXPECTED.length && ledgerKeys.every((k, i) => k === LEDGER_EXPECTED[i]),
    `台账 [${ledgerKeys.join(",")}] vs 期望 [${LEDGER_EXPECTED.join(",")}]`);
  check("④ 逐台天花板排除项真实存在于全机型(改名即台账失效,不许静默)",
    Object.keys(PER_DEVICE_CEILING).every((k) => ALL_KINDS.includes(k)) && ALL_KINDS.length >= 8,
    `全机型 ${ALL_KINDS.length} 个`);
  check("④ 递减豁免集与全机型同源(解析缩集必炸)",
    CAPACITY_EXEMPT_KINDS.length >= 3 && CAPACITY_EXEMPT_KINDS.every((k) => ALL_KINDS.includes(k)),
    CAPACITY_EXEMPT_KINDS.join(","));
  for (const [kind, expected] of Object.entries(HW_CEILING_TOPS)) {
    check(`🔴 ④ ${kind} 天花板 = ${expected} TOPS(固定靶,与设备自己那行 GPU 规格串一致)`,
      ceiling(hw(kind)) === expected, `得到 ${ceiling(hw(kind))}`);
  }

  // 🔴 pc-gpu 有效路径(2026-08-05 证伪 B1 靶):上一版只造 6 类硬件、工厂种子又刻意不含
  //   pc-gpu —— 把这一路整条判 0,门仍 57 pass / 0 fail。电脑算力开着时它是真舰队成员
  //   (app.ts computeShareEnabled → visibleDevices 含 pc-gpu),排名必须有数。
  {
    const tier = GPU_TIERS[GPU_TIERS.length - 1];
    const pcg = hw("pc-gpu", { gpu: `NVIDIA ${tier.keywords[0].toUpperCase()}` });
    check("🔴 ④ pc-gpu 已激活在线单台有效算力 = 所属档位 tops(整条判 0 就红)",
      one(pcg) === tier.tops, `得到 ${one(pcg)},期望 ${tier.tops}`);
    const p = phone(30);
    check("🔴 ④ pc-gpu 参与舰队求和(不是被静默丢掉)",
      near(total([p, pcg]), one(p) + tier.tops, 1e-6), `得到 ${total([p, pcg])}`);
  }
  check("🔴 ④ 非手机单台有效算力 = 天花板本身(不打任何折;任务量递减不许进排名)",
    one(hw("stellarbox-s1")) === HW_CEILING_TOPS["stellarbox-s1"],
    `得到 ${one(hw("stellarbox-s1"))}`);

  // 🔴 P2-11 + P2-7:持有时长不许影响排名入参 —— 逐机型验,一条都不许漏。
  //   · 参与递减的机型漏了 → 用户什么都不做名次就往后掉(规格阳光路径4「永不倒退」失效);
  //   · 豁免机型漏了 → 递减套错机型,而它们降完仍 > 0,上一版完全看不见
  //     (实测删掉 isDegradable() 判断,门仍 35 pass / 0 fail)。
  // 🔴 逐机型 = **全机型**,从导出派生(2026-08-05 结构轮):上一版循环只吃台账 6 键,
  //   phone / pc-gpu 两类的时间不变从没被验过 —— 递减若套错到它们身上,门整场看不见。
  for (const kind of ALL_KINDS) {
    const mk = (purchasedAt) => (kind === "phone" ? phone(30, { purchasedAt }) : hw(kind, { purchasedAt }));
    const old = one(mk(NOW - 400 * DAY));
    const fresh = one(mk(NOW - 1 * DAY));
    check(`🔴 ④ ${kind} 持有 400 天与 1 天贡献**全等**(任务量递减不进排名)`,
      old === fresh && old > 0, `400 天 ${old} vs 1 天 ${fresh}`);
  }

  // 非手机的天花板读的是设备自己那行 GPU 规格串 —— 用档位表逐档自证:
  // 每一档拿它自己的关键词造一个电脑 GPU,解出来必须**恰好**是该档的 tops。
  for (const tier of GPU_TIERS) {
    const gpuLabel = `NVIDIA ${tier.keywords[0].toUpperCase()} · ${tier.tops} TOPS`;
    const resolved = ceiling({ kind: "pc-gpu", gpu: gpuLabel });
    check(`④ 电脑 GPU 按型号串解出档位 ${tier.id} 的 tops(${tier.tops})`,
      resolved === tier.tops, `${gpuLabel} 解成 ${resolved}`);
  }
  check("④ 规格串写明的张数真的乘进去了(把 8× 当 1 张就红)",
    ceiling({ kind: "stellarbox-pro", gpu: "8× RTX 4090" })
      === 8 * ceiling({ kind: "stellarbox-pro", gpu: "RTX 4090" }),
    `8 张 ${ceiling({ kind: "stellarbox-pro", gpu: "8× RTX 4090" })} vs 1 张 ${ceiling({ kind: "stellarbox-pro", gpu: "RTX 4090" })}`);
}

// ── 🔴 GPU 档位单源:排名算力必须读**运营可配**的档位表 ─────────────────────
// 台账 2026-08-05 新缺陷:account-hashrate 曾单参调 matchGpuTier(编译期常量),
// 而这张表运营可编辑(admin E6 改档位 TOPS / 增删识别词;前端 store/app.ts 与
// download 页都读 cfg.config.computeShare.gpuTiers)。运营一改,排名跟不上:
// 改档形态少算 0.725×;新识别词落 G2 兜底最多少算 7.3 倍,当下就翻转名次。
{
  // 行为靶 A:改一档 tops → 聚合结果跟着变(证明真读了穿进来的表,不是常量)。
  const g6 = GPU_TIERS[GPU_TIERS.length - 1];
  const bumped = GPU_TIERS.map((t) => (t.id === g6.id ? { ...t, tops: 1000 } : t));
  const pcg = hw("pc-gpu", { gpu: `NVIDIA ${g6.keywords[0].toUpperCase()}` });
  check("🔴 ⑤ 改一档 tops(660→1000):pc-gpu 单台跟着变(改前 660 / 改后 1000)",
    one(pcg) === g6.tops && one(pcg, NOW, bumped) === 1000,
    `改前 ${one(pcg)} / 改后 ${one(pcg, NOW, bumped)}`);
  check("🔴 ⑤ 改一档 tops:托管硬件(8× 串)聚合同样跟着变(8×1000)",
    one(hw("stellarbox-pro"), NOW, bumped) === 8000,
    `得到 ${one(hw("stellarbox-pro"), NOW, bumped)}`);

  // 行为靶 B:运营给档位加识别词 → 新型号从 G2 兜底(90)升到正档(台账形态②原样)。
  const withKeyword = GPU_TIERS.map((t) => (t.id === g6.id ? { ...t, keywords: [...t.keywords, "rtx 6090"] } : t));
  const future = hw("pc-gpu", { gpu: "NVIDIA RTX 6090 · 660 TOPS" });
  check("⑤ 未收录型号落 G2 兜底 90(现状钉住:这就是少算 7.3 倍的那一支)",
    one(future) === 90, `得到 ${one(future)}`);
  check("🔴 ⑤ 运营加识别词后,同一台立刻解到正档(90 → 660,不再走兜底)",
    one(future, NOW, withKeyword) === g6.tops, `得到 ${one(future, NOW, withKeyword)}`);

  // 单源哨兵(源码级,剥注释后判):
  //   · account-hashrate.ts 出现 GPU_TIERS 字样 = 红(常量回退,连默认参数都不许);
  //   · matchGpuTier 单参调用 = 红(丢掉穿进来的表);0 命中同样红(判据失效)。
  const libSrc = readFileSync(path.join(SRC, "lib", "account-hashrate.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/[ \t]\/\/.*$/gm, "");
  check("🔴 ⑤ 哨兵:account-hashrate.ts 代码里 GPU_TIERS 字样 0 命中(禁 import 常量当档位表)",
    !/\bGPU_TIERS\b/.test(libSrc));
  const calls = [];
  let at = 0;
  while ((at = libSrc.indexOf("matchGpuTier(", at)) !== -1) {
    let depth = 0;
    let commas = 0;
    let j = at + "matchGpuTier".length;
    for (; j < libSrc.length; j++) {
      if (libSrc[j] === "(") depth++;
      else if (libSrc[j] === ")") { depth--; if (depth === 0) break; }
      else if (libSrc[j] === "," && depth === 1) commas++;
    }
    calls.push({ args: commas + 1, text: libSrc.slice(at, j + 1) });
    at = j;
  }
  check("⑤ 哨兵不空转:matchGpuTier 调用真实存在(0 命中 = 判据失效,同样红)",
    calls.length >= 1, `命中 ${calls.length} 处`);
  check("🔴 ⑤ 哨兵:每处 matchGpuTier 调用都带档位表第二参(单参 = 常量回退,红)",
    calls.length >= 1 && calls.every((c) => c.args >= 2),
    calls.map((c) => c.text).join(" | "));

  // 🔴 消费面是**开放集合**(2026-08-06 独立证伪 P2):gpu-tiers.ts:57 的默认参
  //   `tiers = GPU_TIERS` 仍开着口子 —— 上面只封 account-hashrate.ts 一个文件,
  //   新增消费面单参调用就静默落回编译期常量,运营改表它跟不上。
  //   按「单一真理源必锁消费面」:全仓扫,定义行豁免,单参即红。
  const walkSrc = (dir, out = []) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walkSrc(full, out);
      else if (/\.(ts|vue)$/.test(name)) out.push(full);
    }
    return out;
  };
  const offenders = [];
  let repoCalls = 0;
  const filesWithCalls = new Set();
  for (const file of walkSrc(SRC)) {
    const text = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/[ \t]\/\/.*$/gm, "");
    let p = 0;
    while ((p = text.indexOf("matchGpuTier(", p)) !== -1) {
      const isDef = /function\s+$/.test(text.slice(Math.max(0, p - 20), p));
      if (!isDef) {
        let depth = 0, commas = 0, j = p + "matchGpuTier".length;
        for (; j < text.length; j++) {
          if (text[j] === "(") depth++;
          else if (text[j] === ")") { depth--; if (depth === 0) break; }
          else if (text[j] === "," && depth === 1) commas++;
        }
        repoCalls += 1;
        filesWithCalls.add(path.basename(file));
        if (commas + 1 < 2) offenders.push(`${path.basename(file)}: ${text.slice(p, j + 1)}`);
      }
      p += "matchGpuTier".length;
    }
  }
  check(`⑤ 全仓消费面扫描不空转(实扫 ${filesWithCalls.size} 个含调用的文件,今天已知 4 个)`,
    repoCalls >= 3 && filesWithCalls.size >= 3, [...filesWithCalls].join(","));
  check("🔴 ⑤ 全仓每处 matchGpuTier 调用都双参(新消费面单参 = 静默落回常量,红)",
    offenders.length === 0, offenders.join(" | "));
}

// ── 🔴 时间不变 + 确定性 ───────────────────────────────────────────────────
//
// 排名入参里已经没有任何随时间变的东西了,所以这里要的是**全等**,不是「变化很小」:
//   · 手机的 jitter(展示用呼吸感,几秒摆 ±4.5%)由固定种子冻住;
//   · 任务量递减已经整条移出排名入参(留在收益侧的 settleDevice),不再有「只降不升」
//     这种需要被容忍的漂移 —— 上一版那条 `t0 - t30 < 0.01 && 只降不升` 正是在给它让路。
{
  const p = phone(30);
  const p0 = one(p, NOW);
  check("🔴 手机单台在 now / now+1s / now+30s **完全相等**(抖动没进排名)",
    one(p, NOW + 1000) === p0 && one(p, NOW + 30_000) === p0,
    `${p0} → ${one(p, NOW + 1000)} → ${one(p, NOW + 30_000)}`);

  const fleet = [p, hw("stellarbox-s1"), hw("cloud-share")];
  const [t0, t1, t30] = [NOW, NOW + 1000, NOW + 30_000].map((at) => total(fleet, at));
  check("🔴 整舰队在 now / now+1s / now+30s **完全相等**(一点漂移都不许有)",
    t0 === t1 && t1 === t30, `${t0} → ${t1} → ${t30}`);

  // 持有时长那一面由 ④ 组逐机型钉住;这里钉另一面:把时钟推远一年,
  // 非手机部分也必须纹丝不动(递减若从 now 这条路溜回来,上面 30s 的窗口看不见)。
  const hardware = [hw("stellarbox-s1"), hw("stellarrack-p2"), hw("cloud-share")];
  check("🔴 非手机部分在 now 与 now+365d **完全相等**(任务量递减不许从 now 溜回排名)",
    total(hardware, NOW) === total(hardware, NOW + 365 * DAY),
    `${total(hardware, NOW)} → ${total(hardware, NOW + 365 * DAY)}`);

  const runs = new Set(Array.from({ length: 50 }, () => total(fleet)));
  check("🔴 同输入跑 50 次只有一种结果(禁随机数参与)", runs.size === 1, `出现 ${runs.size} 种结果`);
}

// ── 种子账号:全机型端到端,防「某一类设备静默算 0」 ──────────────────────
{
  const seeded = makeInitialDevices().map((d) =>
    d.kind === "phone" ? { ...d, onlineHeartbeatAt: NOW, miningSince: NOW - 10 * HOUR } : d,
  );
  const activeOnes = seeded.filter((d) => d.activatedAt !== null);
  check("种子账号(手机+云算力+3 台硬件)总算力 > 0", total(seeded) > 0, `得到 ${total(seeded)}`);
  check("种子账号里每一台已激活设备都有正贡献",
    activeOnes.length >= 4 && activeOnes.every((d) => one(d) > 0),
    activeOnes.map((d) => `${d.kind}=${one(d).toFixed(1)}`).join(" | "));

  // 🔴 P1-4 端到端:H5 打开的种子账号(工厂造出来就没有常驻 App 心跳)——
  //   每一台都必须有数,尤其是那台手机。上一版这里靠测试自己补一拍心跳才绿。
  const h5Seed = makeInitialDevices();
  const h5Phone = h5Seed.find((d) => d.kind === "phone");
  check("🔴 H5 种子账号(没补过心跳)每台已激活设备仍有正贡献",
    h5Seed.filter((d) => d.activatedAt !== null).every((d) => one(d) > 0),
    h5Seed.filter((d) => d.activatedAt !== null).map((d) => `${d.kind}=${one(d).toFixed(1)}`).join(" | "));
  check("🔴 H5 种子账号那台手机单独看也 > 0(它正在按 hosted 档真给钱)",
    !!h5Phone && one(h5Phone) > 0, `手机 = ${h5Phone ? one(h5Phone) : "找不到"}`);
}

// ── 🔴 ⑥ publicStats 合成种子 = 故意非法哨兵;名次固定靶改喂 fixture 表 ────────
// 819a6da/c37e642 把 publicStats 从 mock 种子里整个移走:合成种子(compat 默认)现在是
// **故意非法哨兵**(全零 + 空分位表,platform-config-compat.ts 原注 "Never replace it
// with plausible data")—— H9 排名在服务端投影到达并通过校验前必须保持 unavailable。
// 本组因此一分为三(z1 2026-08-10 改制,替换原「真种子表」2 条):
//   a) 钉哨兵本身:合成种子必须全零 + 空表,且 isValidPercentileTable(空表)===false
//      恰是期望 —— 有人往哨兵里塞一个「像样的数」= 排名在无服务端数据时凭空可用,当场红;
//   b) 名次固定靶不缩水:改用 **fixture 表**喂真纯函数(表与人口基数 = 819a6da 删掉的
//      那份 10 档种子,逐字抄进本脚本;fixture 是「合法表长什么样」的行为固定靶,
//      不是断言线上种子仍长这样);
//   c) 表合法性校验已上移 src/api/platform-config-api.ts(parsePublicStats:<2 档抛
//      H9_PUBLIC_STATS_RESPONSE_INVALID)—— 钉住该分支存在。
// ⚠️ 舰队取 8 个**算力互不相同**的形态:Pro / Pro v2 / Rack P1 / Rack P2 四 SKU 天花板
//   并列 5280(G6 收同档 = 已知天花板①,见 account-hashrate.ts 文件头)——同算力必
//   同名次(规格③确定性),那不是分位表能解的,靠 Pro 一档代表 + 机架台数拉开量级。
{
  const COMPLETE_SEED = completePlatformConfigSeed(DEFAULT_PLATFORM_CONFIG);
  const SEED = COMPLETE_SEED.publicStats;
  const SEED_TIERS = COMPLETE_SEED.computeShare.gpuTiers;

  // a) 哨兵钉靶(z1 B7:全零在 members/rank/jitter 域里是合法值 —— 哨兵必须
  //    「无正数」且「六个健康位全 false」双向成立,后者是行为判据,域改了也追得上)
  const positives = Object.entries(SEED).filter(([, v]) => typeof v === "number" && v > 0);
  check("🔴 ⑥a 合成种子 publicStats 无任何正数字段(有人塞了像样的数 = 红)",
    positives.length === 0, positives.map(([k, v]) => `${k}=${v}`).join(","));
  const flags = publicStatsHealth(SEED);
  const trueFlags = Object.entries(flags).filter(([, v]) => v === true);
  check("🔴 ⑥a 哨兵在 publicStatsHealth 六个维度上全部不可用(任一 true = 哨兵在该维冒充真数据)",
    trueFlags.length === 0, trueFlags.map(([k]) => k).join(","));
  check("🔴 ⑥a 合成种子分位表为空表,且 isValidPercentileTable(空表) === false(哨兵必须不可用)",
    Array.isArray(SEED.hashratePercentileTable) && SEED.hashratePercentileTable.length === 0
    && isValidPercentileTable(SEED.hashratePercentileTable) === false,
    `len=${SEED.hashratePercentileTable?.length} valid=${isValidPercentileTable(SEED.hashratePercentileTable)}`);

  // b) fixture 名次固定靶。来源:`git show 819a6da~1:src/mock/platform-config.ts`
  //    (该 commit 把 publicStats 移出 mock 种子时删除的 10 档表 + 人口基数,逐字抄录)。
  const FIXTURE_TABLE = [
    { tops: 5, cumPct: 20 }, { tops: 20, cumPct: 55 }, { tops: 60, cumPct: 82 },
    { tops: 150, cumPct: 96 }, { tops: 700, cumPct: 97.6 }, { tops: 2_700, cumPct: 98.7 },
    { tops: 5_400, cumPct: 99.3 }, { tops: 11_000, cumPct: 99.6 }, { tops: 27_000, cumPct: 99.8 },
    { tops: 53_000, cumPct: 99.9 },
  ];
  const FIXTURE_REAL_POPULATION = 1_420_000; // = registeredUsersBase(同 commit 同源)
  const FIXTURE_VIRTUAL_POPULATION = 12_000; // = virtualUserCount(同上)
  check("⑥b fixture 分位表通过 isValidPercentileTable(tops 严格升序 · cumPct 单调不减 ≤100 · ≥2 档)",
    isValidPercentileTable(FIXTURE_TABLE) === true);
  check("⑥b fixture 表覆盖到最大合理舰队量级(最高档 ≥ 50,000 TOPS,10 台顶配机架 ≈ 52,800)",
    FIXTURE_TABLE[FIXTURE_TABLE.length - 1].tops >= 50_000,
    `最高档 ${FIXTURE_TABLE[FIXTURE_TABLE.length - 1].tops}`);

  // 标定值取真工厂给的(node 下 = fallbackCapability);undefined 时真模块自会回退,不手抄。
  const phoneFull = phone(createDevice("phone", "fleet-phone").capabilityTops);
  const phoneH5 = phone(phoneFull.capabilityTops, { onlineHeartbeatAt: null });
  const racks = (n) => Array.from({ length: n }, (_, i) => hw("stellarrack-p2", { id: `fleet-p2-${i}` }));
  const FLEETS = [
    ["只手机(H5,无常驻心跳)", [phoneH5]],
    ["只手机(App 满档)", [phoneFull]],
    ["手机 + 云算力", [phoneFull, hw("cloud-share")]],
    ["手机 + S1", [phoneFull, hw("stellarbox-s1")]],
    ["手机 + Pro(= Pro v2 / Rack P1 / Rack P2 同算力档)", [phoneFull, hw("stellarbox-pro")]],
    ["手机 + 2× Rack P2", [phoneFull, ...racks(2)]],
    ["手机 + 5× Rack P2", [phoneFull, ...racks(5)]],
    ["手机 + 10× Rack P2(最大合理舰队)", [phoneFull, ...racks(10)]],
  ];
  // 算力仍用真聚合现算(档位表用合成种子那份真配置);名次喂 fixture 表 + fixture 人口。
  const rankOf = (tops) => computeRank({
    myTotalHashrate: tops,
    table: FIXTURE_TABLE,
    realPopulation: FIXTURE_REAL_POPULATION,
    virtualPopulation: FIXTURE_VIRTUAL_POPULATION,
  });
  const rows = FLEETS.map(([label, devices]) => {
    const tops = accountTotalHashrate(devices, NOW, BONUS, SEED_TIERS);
    return { label, tops, r: rankOf(tops) };
  });
  console.log(rows.map((x) => `        ${x.label}: ${x.tops} TOPS → ${x.r.kind === "ranked" ? `第 ${x.r.rank} 名(pct ${x.r.percentile.toFixed(3)})` : x.r.kind}`).join("\n"));
  check("⑥b 固定靶不空转:8 档舰队算力互不相同且严格递增(舰队构造坏了先红这条)",
    rows.every((x, i) => i === 0 || x.tops > rows[i - 1].tops),
    rows.map((x) => x.tops).join(" → "));
  check("🔴 ⑥b 8 档舰队全部 ranked(一个都不许掉成 unranked/unavailable)",
    rows.every((x) => x.r.kind === "ranked"),
    rows.map((x) => x.r.kind).join(","));
  const ranks = rows.map((x) => x.r.rank);
  check("🔴 ⑥b 8 档舰队名次**互不相同**(付费档不再钉死同一个数)",
    new Set(ranks).size === ranks.length, ranks.join(" / "));
  check("🔴 ⑥b 名次随算力**严格前进**(每一档都比上一档靠前,不止「不倒退」)",
    ranks.every((r, i) => i === 0 || r < ranks[i - 1]), ranks.join(" → "));
  const beyond = rankOf(1e9);
  check("🔴 ⑥b 超表顶封顶在最优档名次,且 > 1(规格 异常5:永远给不出「第 1 名」)",
    beyond.kind === "ranked" && beyond.rank > 1 && beyond.rank <= ranks[ranks.length - 1],
    JSON.stringify(beyond));

  // c) 合法性校验的新宿主。parsePublicStats 未导出(只能经 parsePlatformComputeConfig
  //    全量 payload 走到,合法 payload fixture 又脆又重)—— 结构钉,剥注释后判:
  //    <2 档分支必须与 H9_PUBLIC_STATS_RESPONSE_INVALID 同语句;逐行单调墙同错误码。
  const apiSrc = readFileSync(path.join(SRC, "api", "platform-config-api.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/[ \t]\/\/.*$/gm, "");
  check("🔴 ⑥c platform-config-api 拒绝 <2 档分位表(!Array.isArray || length < 2 → 抛 H9_PUBLIC_STATS_RESPONSE_INVALID)",
    /!Array\.isArray\(values\.hashratePercentileTable\)\s*\|\|\s*values\.hashratePercentileTable\.length\s*<\s*2\)[\s\S]{0,40}?invalid\("H9_PUBLIC_STATS_RESPONSE_INVALID"\)/.test(apiSrc),
    "platform-config-api.ts 里找不到该分支(校验被删/改弱?)");
  check("⑥c 逐行校验墙也在:tops 严格升序 / cumPct 单调不减,违例抛同一错误码",
    /tops\s*<=\s*previousTops[\s\S]{0,160}?invalid\("H9_PUBLIC_STATS_RESPONSE_INVALID"\)/.test(apiSrc),
    "逐行单调校验缺失或错误码漂移");
}

// ── 接线门:纯函数对 ≠ 有人在用 ─────────────────────────────────────────────
// 上面全绿也可能是「库写好了、store 没接」或「接了又被改回自己算一遍」。
// 判据读 app.ts 源码(先剥注释,免得注释里的字样冒充实现)。
{
  const src = readFileSync(path.join(SRC, "store", "app.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
  check("接线:app.ts 从 @/lib/account-hashrate 引入 accountTotalHashrate",
    /import\s*\{[^}]*accountTotalHashrate[^}]*\}\s*from\s*["']@\/lib\/account-hashrate["']/.test(src));
  // 惰性正则切函数体会从别处起跳(上一版就这么假绿过),改成按位置确定性切片。
  const fnAt = src.indexOf("function myTotalHashrateAt(");
  const fnEnd = fnAt < 0 ? -1 : src.indexOf("\n  }", fnAt);
  const fnBody = fnAt < 0 || fnEnd < 0 ? "" : src.slice(fnAt, fnEnd + 4);
  check("接线:store 暴露 myTotalHashrateAt 且由 accountTotalHashrate 现算(不缓存、不另算)",
    fnBody.includes("accountTotalHashrate("), fnBody || "没找到 myTotalHashrateAt");
  check("接线:算的是 visibleDevices(电脑算力关掉时那些设备被冻结不产出,不该计)",
    /visibleDevices/.test(fnBody), fnBody);
  // 🔴 P2-10:写成 computed 里读 Date.now() 时,Date.now() 不是响应式源 ——
  //   tick 一停摆(顶号/登出/吊销时早退),整个值就冻在过去某一刻,掉线的设备还在榜上。
  check("🔴 接线:算力入参不许自己读 Date.now()(非响应式时钟,tick 停摆就冻住)",
    fnBody.length > 0 && !/Date\.now\(\)/.test(fnBody), fnBody);
  check("🔴 接线:传给聚合的 now 就是调用方给的那个入参(不是别处捞来的时刻)",
    /accountTotalHashrate\(\s*visibleDevices\.value\s*,\s*now\s*,/.test(fnBody), fnBody);
  // 🔴 ⑤ 单源接线:档位表必须来自配置 store(运营在 E6 改档 / 加识别词,排名要跟着走)。
  //   传常量 / 传空表 / 少传这一参,这条当场红(与上方源码哨兵互为表里:那边守库,这边守消费面)。
  check("🔴 接线:GPU 档位表参数 = cfg.config.computeShare.gpuTiers(单源,禁常量/别处捞表)",
    /accountTotalHashrate\([^;]*cfg\.config\.computeShare\.gpuTiers\s*\)/.test(fnBody), fnBody);
  // 🔴 这条第一版是**假绿**:`return\s*\{[\s\S]*?myTotalHashrate` 的惰性匹配会从文件里
  //   任意一个更早的 `return {` 起跳,把声明行当成 return 里的那一处 ——
  //   把 store return 里的名字删掉,门照样绿。改成只切最后一个 return 块再判。
  const storeReturn = src.slice(src.lastIndexOf("return {"));
  check("接线:myTotalHashrateAt 出现在 store 的 return 里(否则页面拿不到)",
    /\bmyTotalHashrateAt\b/.test(storeReturn) && /\}\);\s*$/.test(storeReturn.trim()),
    storeReturn ? "store return 里没有这个名字" : "找不到 store 的 return 块");
}

// 🔴 防空集假绿:断言数量必须**恰好**等于这个数,不是「不低于」。
//   上一版是 FLOOR = 28 而实际 35 —— 留了 7 条余量,正好等于两个最关键判据组的总和
//   (时间不变 3 条 + 接线 4 条),把它们整组删掉门照样 exit 0(实测)。
//   留余量的地板等于没有地板。加断言 = 同步改这个数,失败信息里直接写着该改成几。
// 2026-08-05 修复轮 +15:GPU 档位单源 ×7(行为靶 4 + 源码哨兵 3)+ 8 档舰队名次固定靶 ×7 + 档位表接线 ×1
// 2026-08-06 +2:matchGpuTier 全仓消费面扫描(不空转 + 单参即红)
const EXPECTED_CHECKS = 86; // 2026-08-10 z1 +5:⑥ 改制 —— 哨兵钉靶 3(B7 无正数 + 六健康位全 false + 空表)+ fixture 表自证 2 + 校验宿主 2,替换原「真种子表」2 条
if (pass + fail !== EXPECTED_CHECKS) {
  console.log(`\nFAIL 断言总数 ${pass + fail} ≠ 台账 ${EXPECTED_CHECKS} —— 判据被删/被跳过?若是有意加断言,把 EXPECTED_CHECKS 改成 ${pass + fail}。`);
  process.exit(1);
}
console.log(`\n${pass} pass / ${fail} fail(样本:真工厂造的 8 类设备形态 · 6 类非手机天花板固定靶 · 6 档 GPU 型号解析 · 改档/加词双形态 GPU 配置靶 · 全零哨兵钉靶 + 8 档参考舰队名次(fixture 分位表=819a6da 删除的 10 档种子)· 3 个时刻 + 365 天 · 50 次确定性重跑)`);
process.exit(fail === 0 ? 0 : 1);
