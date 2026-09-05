// 远端平台配置「解析完必须落进 store」的行为门 —— 随契约套件跑:
//   node --test scripts/remote-config-merge-contract.test.mjs
//
// 背景(z1 独立审计 P0-3,2026-08-11 回源确认):config.ts 的 load() 用**手写字段清单**
// 往 config.value 里合并远端快照,清单漏了 publicStats —— 解析器完整校验过的服务端投影
// (H9)当场被丢弃,store 里永远只剩 compat 的「故意非法」哨兵,publicStatsHealth 六位
// 恒 false,首页脉搏卡 / on-grid 页脚 / globe / onboarding / ref / trust 共 16 个消费点
// 永久走「不可用」占位。全套件当时没有任何一条断言守这条链。
//
// 🔴 守的不变量(**按族守,不按字段守**):
//   API 层交付的快照里,每一个属于 PlatformConfig 的字段,load() 之后都必须能在
//   store 里取到服务端那份值。根因是「手写清单」本身 —— 只钉 publicStats 一个字段,
//   下次往解析器加字段照样静默掉进同一个坑。故判据是**覆盖等式**:
//   keys(delivered) ∩ keys(config) 逐个比对,漏一个即红。
//
// 方法:esbuild 载**真** store + **真**解析器,只把 @/api/runtime 换成「remote 开 +
// 喂一份契约合法的服务端载荷」的 stub —— 被判的合并逻辑是真的,stub 只扮演服务器。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { build } from "esbuild";
import { atAliasResolver } from "./lib/at-alias.mjs";
import { VUE_STUB_NXREF } from "./lib/harness-stubs.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC = path.join(root, "src");

// ── 服务端载荷:契约合法,且每个值都**不可能来自别处** ────────────────────────
// fleetDevices 刻意取 31337(既非哨兵 0,也非编译期锚 28,432)—— store 里出现这个数
// 只可能是「从这份载荷流过来的」,断言因此是构造性的,不靠「看起来变了」。
const SERVED_PLATFORM = {
  featureFlags: {
    computeShareEnabled: true,
    homeNewcomerTasksEnabled: true,
    homeWeeklyPromoEnabled: false,
  },
  publicStats: {
    version: 7,
    realUserCount: 214_000,
    values: {
      fleetDevices: 31_337,
      onlineRatePct: 87.5,
      onlineJitter: 43,
      registeredUsersBase: 2_100_000,
      registeredUsersMonthlyGrowthPct: 6.5,
      registeredUsersAnchorAt: 1_754_870_400_000,
      virtualUserCount: 1_900_000,
      hashratePercentileTable: [
        { tops: 0, cumPct: 0 },
        { tops: 120, cumPct: 48 },
        { tops: 640, cumPct: 92 },
        { tops: 2_400, cumPct: 100 },
      ],
    },
  },
  // 🔴 0.45 / 3 是**刻意偏离种子**(种子是 0.6 / 2)。首版 fixture 照抄了种子值,
  //   结果抽掉 `onlineBonus: remote.onlineBonus` 这行合并、本门照样全绿 —— 服务端值
  //   与种子同值时,「合并了」和「漏合并」两种状态根本不可区分,那一格等式是空过。
  //   下面 ③ 的反空过断言会把这个坑钉死,新增字段照样得选个偏离种子的值。
  onlineBonus: { h5BaseFactor: 0.45, continuityFullHours: 3 },
  computerCompute: {
    domain: "E6",
    flags: [{ key: "computeShareEnabled", enabled: true }],
    coefficients: [
      { key: "h5BaseFactor", value: 0.45 },
      { key: "continuityFullHours", value: 3 },
    ],
    yieldEstimate: [
      { key: "topsBaseline", value: 100 },
      { key: "dailyUsdtPerBaseline", value: 0.24 },
      { key: "nexPerUsdt", value: 10 },
    ],
    gpuTiers: ["G1", "G2", "G3", "G4", "G5", "G6"].map((id, i) => ({
      id,
      label: `Tier ${id}`,
      tops: (i + 1) * 100,
      keywords: [{ slot: "keyword1", value: `kw-${id}` }],
    })),
    download: {
      url: "https://cdn.nexgrid.invalid/compute-share.exe",
      zhTitle: "算力共享", zhGuide: "安装后登录即可",
      enTitle: "Compute Share", enGuide: "Sign in after install",
    },
    sources: ["e6.compute_config"],
  },
  updatedAt: "2026-08-11T00:00:00Z",
  share: {
    baseUrl: "https://nexgrid.ai/ref/",
    channels: [{ key: "zalo", intentType: "scheme", textTemplate: "加入 {link}", enabled: true }],
    appDownload: {
      officialUrl: "https://download.nexgrid.ai/app/NexGrid-1.2.3.apk",
      iosUrl: "", androidUrl: "", apkUrl: "", version: "1.2.3",
      releaseNotes: { zh: "稳定性修复", en: "Stability fixes" }, source: "official",
    },
  },
};

const SERVED_REFERRAL = {
  welcomeGift: { lockMode: "risk_bucket", usdtAmount: 3, nexAmount: 30 },
  inviterReward: { nexAmount: 12 },
  rhythmMonth: 3,
  newcomerMultiplier: 1.5,
  inviterMultiplier: 1.2,
  effectiveAt: "2026-08-01T00:00:00Z",
  sources: ["nx_user.sponsor_user_id"],
};

// ── harness ─────────────────────────────────────────────────────────────────
globalThis.uni = {
  getStorageSync: () => "",
  setStorageSync: () => {},
  removeStorageSync: () => {},
  getSystemInfoSync: () => ({ language: "en" }),
};

// runtime-stub:remote 开 + platformConfigApi 走**真** createPlatformConfigApi。
// 载荷因此必须过真解析器 —— 手捏一个「解析器根本不认」的 fixture 就红,fixture 与
// 后端契约同生共死。其余导出一律不可用代理;导出清单从磁盘扫,新增 API 不会掉队
// (手列清单漂移正是 z1 立案的老坑)。
function servingRuntimeStub() {
  const src = readFileSync(path.join(root, "src", "api", "runtime.ts"), "utf8");
  const names = [...src.matchAll(/^export (?:const|let|function|async function) (\w+)/gm)].map((m) => m[1]);
  if (!names.includes("remoteApiEnabled") || !names.includes("platformConfigApi")) {
    throw new Error("runtime.ts 导出面解析失败(缺 remoteApiEnabled / platformConfigApi)—— 判据失效必红");
  }
  const special = {
    remoteApiEnabled: "export const remoteApiEnabled = true;",
    apiRuntimeConfig: 'export const apiRuntimeConfig = { mode: "remote", baseUrl: "http://config-merge-gate.invalid" };',
    platformConfigApi: `export const platformConfigApi = createPlatformConfigApi({
      request: async ({ path }) => (path.includes("referral") ? SERVED_REFERRAL : SERVED_PLATFORM),
    });`,
  };
  return `import { createPlatformConfigApi } from "@/api/platform-config-api";
const SERVED_PLATFORM = ${JSON.stringify(SERVED_PLATFORM)};
const SERVED_REFERRAL = ${JSON.stringify(SERVED_REFERRAL)};
const unavailable = new Proxy({}, { get: () => async () => { throw new Error("outside this gate"); } });
${names.map((n) => special[n] ?? `export const ${n} = unavailable;`).join("\n")}`;
}

const STUBS = {
  "pinia-stub": `const cache = new Map();
const unwrap = (v) => (v && typeof v === "object" && v.__nxRef === true);
export const defineStore = (id, setup) => () => {
  if (!cache.has(id)) cache.set(id, new Proxy(setup(), {
    get(t, k) { const v = Reflect.get(t, k); return unwrap(v) ? v.value : v; },
    set(t, k, val) { const v = Reflect.get(t, k); if (unwrap(v)) { v.value = val; return true; } return Reflect.set(t, k, val); },
  }));
  return cache.get(id);
};`,
  "vue-stub": VUE_STUB_NXREF,
  "runtime-stub": servingRuntimeStub(),
};

const out = await build({
  stdin: {
    // 🔴 platformConfigApi 取自 stub 后的 @/api/runtime —— 等式左边必须是「API 层**交付**
    //   的那份快照」,不是 parsePlatformComputeConfig 单独的产出:rewards 走 H8 自己的
    //   bounded context,由 createPlatformConfigApi 二次合并进来(compute 解析器那边只留
    //   一个全 0 占位)。拿半份快照当期望,会把正确的实现判成漏字段(本门首跑实锤)。
    contents: `export { useConfig } from "@/store/config";
export { platformConfigApi } from "@/api/runtime";
export { publicStatsHealth } from "@/lib/platform-stats";`,
    resolveDir: root, loader: "ts",
  },
  bundle: true, write: false, format: "esm", platform: "neutral",
  define: { "import.meta.env.PROD": "false", "import.meta.env.DEV": "true", "import.meta.env.MODE": '"test"' },
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /^pinia$/ }, () => ({ path: "pinia-stub", namespace: "stub" }));
      b.onResolve({ filter: /^vue$/ }, () => ({ path: "vue-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\/api\/runtime$/ }, () => ({ path: "runtime-stub", namespace: "stub" }));
      b.onResolve({ filter: /^@\// }, atAliasResolver(SRC, "remote-config-merge-contract"));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path], loader: "ts" }));
    },
  }],
});
const { useConfig, platformConfigApi, publicStatsHealth } =
  await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));

const delivered = await platformConfigApi.platformConfig();
const store = useConfig();
const beforeLoad = structuredClone(store.config);
const syncFailedBeforeLoad = store.syncFailed;
await store.load();

/** 覆盖等式的判据本体:解析结果里属于 PlatformConfig 的字段,哪些没落进 store。 */
function unlandedFields(snapshot, config) {
  return Object.keys(snapshot)
    .filter((k) => Object.prototype.hasOwnProperty.call(config, k))
    .filter((k) => (k === "featureFlags"
      // featureFlags 是**并集**语义(客户端 flag 多于服务端下发的子集),按服务端键逐个比
      ? Object.entries(snapshot[k]).some(([fk, fv]) => config[k]?.[fk] !== fv)
      : JSON.stringify(config[k]) !== JSON.stringify(snapshot[k])));
}

test("远端快照落库前:H9 不得暴露可用的生产事实", () => {
  const health = publicStatsHealth(beforeLoad.publicStats);
  assert.equal(syncFailedBeforeLoad, true, "load 前必须由 authority 同步失败态关闭所有远端事实消费");
  assert.equal(health.devicesOk, false, "load 前设备事实不得可用");
  // 真实系统允许 0 个用户，因此 rankOk 只负责字段域校验，不能把合法 0 当成
  // “尚未加载”哨兵；消费面由上面的 syncFailed 权威门关闭。
  assert.equal(beforeLoad.publicStats.fleetDevices, 0);
  assert.equal(beforeLoad.publicStats.realUserCount, 0);
});

test("服务端 publicStats 有路径进 store(z1 P0-3 的直接回归门)", () => {
  assert.equal(store.syncFailed, false, "load() 没成功,后面的断言全是空过");
  // 构造性判据:31337 这个值全仓只存在于本门的载荷里
  assert.equal(store.config.publicStats.fleetDevices, 31_337);
  assert.deepEqual(store.config.publicStats, delivered.publicStats);
  const health = publicStatsHealth(store.config.publicStats);
  for (const [dim, ok] of Object.entries(health)) {
    assert.equal(ok, true, `服务端投影已落库,但 ${dim} 仍判不可用`);
  }
});

test("覆盖等式:解析器交付的每个 PlatformConfig 字段都必须落进 store", () => {
  const covered = Object.keys(delivered).filter((k) => Object.prototype.hasOwnProperty.call(store.config, k));
  // 判据失效必红:交集塌成 0/1 时下面的循环会空过,看起来照样绿
  assert.ok(covered.length >= 5, `覆盖面只剩 ${covered.length} 个字段(${covered.join(",")})—— 判据失效`);

  // ③ 反空过:每个被比对的字段,服务端值必须与 load 前的种子值**不同**。同值的字段
  //   等式恒真,漏合并也照样绿(首轮红测 B 实锤:onlineBonus 抄了种子值,抽掉合并行
  //   三条断言全绿)。这条断言让「fixture 挑了个不discriminating的值」自己变红。
  const vacuous = covered.filter((k) => JSON.stringify(beforeLoad[k]) === JSON.stringify(delivered[k]));
  assert.deepEqual(vacuous, [], "服务端值与种子同值 —— 这些字段的覆盖等式是空过,换个偏离种子的 fixture 值");

  assert.deepEqual(unlandedFields(delivered, store.config), [], "解析完却没进 store 的字段");

  // 红测:把已落库的 publicStats 换回 load 前的哨兵,判据必须咬住 —— 证明上面那条
  // 空数组是「真的检查过」,不是判据恒真(z1 前的 load() 产出的正是这个状态)。
  assert.deepEqual(
    unlandedFields(delivered, { ...store.config, publicStats: beforeLoad.publicStats }),
    ["publicStats"],
  );
});
