import { defineStore } from "pinia";
import { ref } from "vue";
import type { Listing } from "@/components/genesis/listing-card.vue";
import type { ActivityEvent } from "@/components/genesis/activity-row.vue";
import { genesisApi, remoteApiEnabled } from "@/api/runtime";

/**
 * Genesis config — 创世节点的「后台可控」参数(阶梯定价 / 预售倒计时 / 权益文案 /
 * 商城上架 / 二级市场运营引擎 / 盘面统计),以 store 承载而非 const。照 trial-config.ts
 * 范式(DEFAULT + hydrate merge-over-defaults + update/reset + uni storage)。
 * 真后台由 admin G4 `G.genesis.*` server-canonical 下发,此处可序列化 mock 镜像。
 *
 * 🔴 档位类型 + 默认值定义在**本叶子文件**(不在 genesis.ts),genesis store 单向
 * import 本文件——避免「默认值在 genesis.ts / config import 它」的 TDZ 循环。
 * MOCK-ONLY;规格 FEAT-GEN09/GEN10。
 */

// ── 阶梯档位(累计售出落 [from,to) 决定当前档,售罄硬跳价)──
export interface GenesisTier {
  id: string; // "wl" | "t1" | "t2" | 运营新增档任意 id
  from: number; // inclusive cumulative-sold lower bound
  to: number; // exclusive upper bound
  priceUSDT: number;
}
export const GENESIS_TIERS_DEFAULT: readonly GenesisTier[] = [
  { id: "wl", from: 0, to: 100, priceUSDT: 7999 },
  { id: "t1", from: 100, to: 550, priceUSDT: 9999 },
  { id: "t2", from: 550, to: 1000, priceUSDT: 11999 },
];

/** 纯函数:累计售出 → 当前档(空/非法档位回退占位,fail-safe 末档兜底)。
 *  genesis store 与 genesis.vue 共用单源。 */
export function tierForSold(tiers: readonly GenesisTier[], sold: number): GenesisTier {
  if (!tiers || tiers.length === 0) return { id: "t1", from: 0, to: 1000, priceUSDT: 9999 };
  for (const tier of tiers) {
    if (sold >= tier.from && sold < tier.to) return tier;
  }
  return tiers[tiers.length - 1];
}

/** 预售锁定门:saleStartAt 非空且未到 = 未开售。独立于 nexListed(上所)。 */
export function isPreSale(saleStartAt: number | null, now: number): boolean {
  return saleStartAt != null && now < saleStartAt;
}

// ── 购买可用性:唯一派生出口(规格 FEAT-GEN10 ④)──────────────────────────────
/** 阻断原因;`null` = 可购买。顺序即优先级,`genesisPurchaseBlock` 按此链取**最高**一条。 */
export type GenesisPurchaseBlock =
  | "configUnavailable" // 配置未知 → 保守锁购(异常3:禁在配置未知时放行)
  | "marketClosed"      // 运营把市场设为暂未开放
  | "halted"            // J1 Genesis kill-switch projection
  | "soldOut"           // 售罄 → 引导二级市场
  | "preSale"           // 预售未到 → 倒计时锁
  | null;

export interface GenesisPurchaseInput {
  /** 配置是否已成功拉到。false = 未知,走保守锁购。 */
  configLoaded: boolean;
  marketOpenState: "open" | "closed";
  /** 熔断是否生效。远程模式由 Genesis public state 的 J1 投影提供；
   * mock 模式才使用显式本地值。 */
  halted: boolean;
  /** 剩余可售名额。 */
  remaining: number;
  saleStartAt: number | null;
  now: number;
}

/**
 * 购买可用性的**唯一**判定出口(纯函数,server 与 mock 同构)。
 *
 * 🔴 为什么必须收成一处:改造前「能不能买」在 `dockCtaText`(按钮文案)与 `openSheet`
 * (点击处理)**各判一套**,两处顺序恰好一致纯属巧合 —— 任一处加条件而另一处忘了,
 * 就会出现「按钮写着可买、点了没反应」或反过来「按钮灰着却能点进结算」。
 * 规格 FEAT-GEN10 ④ 因此要求单一派生,**禁多处各判一套**。
 *
 * 优先级(规格 ④,不可换序):配置未知 > 市场关闭 > 熔断 > 售罄 > 预售倒计时。
 * 取**最高一条**,不叠加、不闪烁互换(异常2)。
 */
export function genesisPurchaseBlock(input: GenesisPurchaseInput): GenesisPurchaseBlock {
  if (!input.configLoaded) return "configUnavailable";
  if (input.marketOpenState === "closed") return "marketClosed";
  if (input.halted) return "halted";
  if (input.remaining <= 0) return "soldOut";
  if (isPreSale(input.saleStartAt, input.now)) return "preSale";
  return null;
}

/** 关闭态**不得**展示倒计时与名额紧迫文案(规格 ④:不对不可购买的东西制造紧迫感)。
 *  售罄同理(已经没了,催也没用)。判据集中在此,页面不各自 if。 */
export function genesisShowsUrgency(block: GenesisPurchaseBlock): boolean {
  return block === null || block === "preSale";
}

/**
 * 这个阻断档是不是「**确定**买不了」——`configUnavailable` 意为「还不知道」,不算。
 *
 * 🔴 为什么这条也必须住在本体里:调用方(周任务报警器)原本自己抄了一份四档白名单,
 *   ④a 当场判红,判得对 —— 抄一份就等于**多一处会漂的档位副本**,本体改名它静默失效,
 *   而它失效的表现是「报警从此不响」,没有任何编译期信号。放在这里,改名即编译错。
 * 🔴 与 genesisShowsUrgency 的区别:那条管「能不能催」,这条管「能不能据此下结论」。
 *   两者对 `preSale` 的取值恰好相反(未开售可以催、也确实买不了),别合并。
 */
export function genesisBlockIsKnownUnavailable(block: GenesisPurchaseBlock): boolean {
  return block !== null && block !== "configUnavailable";
}

/**
 * **二级市场**(承接他人挂单)的阻断判定。
 *
 * 与主售只差两处输入:二级卖的是**别人手里的存量**,主售售罄或未开售都不妨碍转让,
 * 所以名额与开售时间两档喂成恒不命中 —— 而不是靠调用方漏判来「碰巧不拦」。
 *
 * 🔴 **写成函数是因为它有两个调用方**(marketplace 页面 + store 的 acquireSecondary),
 * 而 store 用不了 composable(没有组件生命周期)。上一版两边各拼一套输入,
 * 结果页面只挡「市场关闭」、store 只挡「关闭 + 配置未知」,注释还写着「熔断也拦」——
 * 三处说法互不一致(2026-08-05 独立验收 P1-5 / P1-6)。
 */
export function genesisSecondaryBlock(cfg: {
  loaded: boolean;
  marketOpenState: "open" | "closed";
  halted?: boolean;
  now: number;
}): GenesisPurchaseBlock {
  return genesisPurchaseBlock({
    configLoaded: cfg.loaded,
    marketOpenState: cfg.marketOpenState,
    halted: cfg.halted ?? false,
    remaining: Number.POSITIVE_INFINITY,
    saleStartAt: null,
    now: cfg.now,
  });
}

// ── 预售页权益(4 项,双语;空字段 = 回退现 i18n)──
export interface GenesisPerk {
  nameZh: string;
  nameEn: string;
  descZh: string;
  descEn: string;
}
function emptyPerks(): GenesisPerk[] {
  return Array.from({ length: 4 }, () => ({ nameZh: "", nameEn: "", descZh: "", descEn: "" }));
}

// ── 运营挂单(用户可真实承接;结构兼容 Listing + 来源标记)──
export interface OpsListing extends Listing {
  source: "ops"; // UI 永不暴露此字段(0 meta);仅内部区分
  /** listedAt 约定:负值 = 相对 now 偏移(种子,store 顶层无 Date.now());
   *  正值 = 绝对 epoch ms(运营新建时 admin 侧取当刻)。marketplace 合并时解析:
   *  resolved = listedAt < 0 ? now + listedAt : listedAt。 */
}

// ── 盘面展示统计(纯展示可配)──
export interface GenesisMarketStats {
  floor: number;
  vol24h: number;
  listed: number;
  owners: number;
  floorDeltaPct: number;
}

/** 关闭态文案变体键 —— **白名单常量**,后台只能在其中选,不能自由输入正文。
 *  规格 FEAT-GEN10 ③:「禁后台自由输入正文,防绕过文案纪律」。
 *  每个键在 i18n `genesis.marketClosed.*` 下三语镜像。 */
export const GENESIS_CLOSED_NOTICE_KEYS = ["default", "maintenance", "phase_control", "compliance"] as const;
export type GenesisClosedNoticeKey = (typeof GENESIS_CLOSED_NOTICE_KEYS)[number];

export interface GenesisConfig {
  /** J1 Genesis kill-switch projection; remote mode is server authoritative. */
  halted: boolean;
  killSwitchRevision: string;
  killSwitchSource: string;
  // 阶梯定价
  tiers: GenesisTier[];
  /** 市场状态(规格 FEAT-GEN10):`closed` = 页面照常可看、但一律不可购买。
   *  单源 = 后台 G4,server-canonical,client 仅缓存展示。
   *  🔴 与 `showcaseEnabled` **相互独立**:关闭市场 ≠ 下架(规格 ③)。
   *  🔴 与 `saleStartAt` 也独立,且优先级**高于**它(规格 ④)。 */
  marketOpenState: "open" | "closed";
  /** 关闭态文案变体;仅取 GENESIS_CLOSED_NOTICE_KEYS 内的值,非法值回退 "default"。 */
  closedNoticeKey: GenesisClosedNoticeKey;
  // 预售倒计时
  saleStartAt: number | null;
  showCountdown: boolean;
  // 商城上架
  showcaseEnabled: boolean;
  // 预售页权益(空 = 回退 i18n)
  perks: GenesisPerk[];
  // 二级市场运营挂单
  opsListings: OpsListing[];
  // FOMO 成交引擎
  fomoEnabled: boolean;
  fomoIntervalMinMs: number;
  fomoIntervalMaxMs: number;
  fomoPriceBandPct: number;
  fomoDailyCap: number;
  /** 手动注单持久池(引擎自动生成的虚拟成交是运行时 ephemeral,不持久)。 */
  fomoActivity: ActivityEvent[];
  // 盘面统计
  marketStats: GenesisMarketStats;
}

const HOUR = 3600_000;
const DAY = 86400_000;

export const DEFAULT_GENESIS_CONFIG: GenesisConfig = {
  halted: false,
  killSwitchRevision: "mock-local",
  killSwitchSource: "mock-local",
  tiers: GENESIS_TIERS_DEFAULT.map((t) => ({ ...t })),
  marketOpenState: "closed", // fail-closed until the server state is available
  closedNoticeKey: "default",
  saleStartAt: null, // 默认已开售(不阻断现状)
  showCountdown: true,
  showcaseEnabled: false,
  perks: emptyPerks(),
  // 运营挂单默认用高位 token 段(≥900)避免与用户持仓 token 撞号。
  opsListings: [
    { tokenId: 903, priceUSDT: 14_200, lastSaleUSDT: 11_999, seller: "0x7c1e4a9f3b28", listedAt: 0 - 2 * HOUR, traits: { tier: "Founder #903", boost: "1.5×", mintYear: 2026 }, source: "ops" },
    { tokenId: 917, priceUSDT: 13_700, lastSaleUSDT: 9_999, seller: "0x2fa9c81d740b", listedAt: 0 - 10 * HOUR, traits: { tier: "Founder #917", boost: "1.5×", mintYear: 2026 }, source: "ops" },
    { tokenId: 946, priceUSDT: 13_500, lastSaleUSDT: 11_999, seller: "0xb840e37c1259", listedAt: 0 - 1 * DAY, traits: { tier: "Founder #946", boost: "2.0×", mintYear: 2026 }, source: "ops" },
  ],
  fomoEnabled: true,
  fomoIntervalMinMs: 180_000, // 3 分钟
  fomoIntervalMaxMs: 600_000, // 10 分钟
  fomoPriceBandPct: 0.15, // 地板价 ±15%
  fomoDailyCap: 40,
  fomoActivity: [],
  marketStats: {
    floor: 13_400,
    vol24h: 1_247_300,
    listed: 89,
    owners: 953,
    floorDeltaPct: 18,
  },
};

const STORAGE_KEY = "nexgrid-genesis-config-v1";

/** 档位健全性校验(fail-closed):非空、from 升序连续、末档 to≥minTotal(已售数)、价>0。
 *  任一违反 → 回退默认,避免运营误配导致前端派生越界。 */
function sanitizeTiers(tiers: unknown, minTotal: number): GenesisTier[] {
  if (!Array.isArray(tiers) || tiers.length === 0) return DEFAULT_GENESIS_CONFIG.tiers.map((t) => ({ ...t }));
  let prevTo = 0;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i] as Partial<GenesisTier>;
    if (
      typeof t.from !== "number" ||
      typeof t.to !== "number" ||
      typeof t.priceUSDT !== "number" ||
      t.priceUSDT <= 0 ||
      t.from !== prevTo || // 连续:本档 from = 上档 to
      t.to <= t.from
    ) {
      return DEFAULT_GENESIS_CONFIG.tiers.map((x) => ({ ...x }));
    }
    prevTo = t.to;
  }
  if (prevTo < minTotal) return DEFAULT_GENESIS_CONFIG.tiers.map((x) => ({ ...x })); // 总量须 ≥ 已售
  return (tiers as GenesisTier[]).map((t) => ({ id: String(t.id), from: t.from, to: t.to, priceUSDT: t.priceUSDT }));
}

function freshDefaults(): GenesisConfig {
  return { ...DEFAULT_GENESIS_CONFIG, tiers: DEFAULT_GENESIS_CONFIG.tiers.map((t) => ({ ...t })), perks: emptyPerks() };
}

/**
 * 读一次配置源(mock 期 = uni storage;真后台 = `GET /api/config/genesis`)。
 * `ok` 区分两种「读不到」:
 *   - **首次运行**(源里没存过值)→ 返回默认值,`ok: true` —— 正常情形;
 *   - **源本身抛错**(storage API 不可用 / 真后台请求失败)→ `ok: false`,
 *     `genesisPurchaseBlock` 随即走 `configUnavailable` 保守锁购(规格异常3)。
 * 🔴 fail-safe 方向:盘上存了**脏值**回退 open(一个坏字节不该永久停售);
 *   **源不可达**才锁购 —— 两种失败方向相反,不许合并。
 */
/**
 * 探配置源是否真的可读 —— **不能靠 `uni.getStorageSync` 抛异常来判**。
 *
 * 🔴 独立审计回源实测(`@dcloudio/uni-h5` 的 `getStorageSync` 实现):它自己包了
 *    `try { … } catch { return "" }`,存储缺失 / 被禁用 / 读失败**一律被吞成空串**。
 *    所以外层的 catch 永远接不到东西 —— 上一版就是这么写的,`loaded` 恒 true,
 *    `configUnavailable` 依旧是死代码,而我却报了「已修」。
 *    更糟的是方向反了:存储真不可用时反而回落 `open`(放行),与本文件注释宣称的
 *    「源不可达才锁购」正相反。
 *
 * 判据改成**往返自证**:写一个探针键再读回来,值对不上就是源不可用。
 * 这不依赖任何 API 的异常语义,换端 / 换实现都成立。
 */
function storageReadable(): boolean {
  const probeKey = "nexgrid-storage-probe";
  const token = `p${Date.now()}`;
  let ok = false;
  try {
    uni.setStorageSync(probeKey, token);
    ok = uni.getStorageSync(probeKey) === token;
  } catch {
    ok = false; // 抛了也算不可用(别的端可能真抛)
  }
  // 🔴 清理**不参与判据**(2026-08-05 独立验收 P1):remove 抛错时 set 与 get 都已成功,
  //   源显然可用。上一版把 remove 放在同一个 try 内、且排在 `return back === token` 之前,
  //   于是「配额满 / 隐私模式 / 端实现差异」导致的清理失败被误判成「源不可达」——
  //   主售 + 二级 + 挂单三条链一起 fail-closed 锁死。
  //   token 保持每次唯一:证明的是「**这一次**写落地了」,换成常量的话
  //   「remove 失败 + set 失败」组合会读回上一轮残留值而误报 OK(证伪 agent B3)。
  try { uni.removeStorageSync(probeKey); } catch { /* 清理失败不改判据 */ }
  return ok;
}

function hydrate(): { config: GenesisConfig; ok: boolean } {
  let raw: unknown;
  try {
    raw = uni.getStorageSync(STORAGE_KEY);
  } catch {
    // 🔴 源不可达 → configUnavailable 保守锁购(规格异常3)。与「盘上存了脏值」方向相反:
    //   脏值回退 open(一个坏字节不该永久停售),源不可达才锁。
    return { config: freshDefaults(), ok: false };
  }
  // 🔴 先读、读到合法对象就**不写探针**(2026-08-05 证伪 agent B5)。
  //   读成功本身就是「源可读」的证明 —— 再写一轮探针是纯冗余。探针只用来分辨
  //   「从没存过」与「源挂了」,而这两种情况都表现为读回空值,见下面那一支。
  //   🔴 明确不做的两件:① 不给探针结果加时间窗缓存 —— 缓存期内源真坏掉会把
  //   fail-closed 翻成 fail-open(已关的市场重新开门且可下单),而 purchase /
  //   listNode / acquireSecondary 三处动钱前的 refresh() 要的正是**当下**的源;
  //   ② 不给探针键加随机后缀 —— 固定键自覆盖,随机键在 remove 失败时每次冷启动
  //   泄漏一条(小程序端同步存储有 10MB 上限),而它要防的键碰撞全仓只有这一处生产者。
  if (raw && typeof raw === "object" && (raw as { config?: unknown }).config) {
    try {
      const s = raw as { config: Partial<GenesisConfig> };
      // Merge over defaults so newly-added fields exist for old persisted state.
      const merged = { ...DEFAULT_GENESIS_CONFIG, ...s.config };
      merged.tiers = sanitizeTiers(s.config.tiers, 0);
      // 🔴 旧字段迁移(2026-08-05 marketStatus→marketOpenState,两端统一命名,主人拍板):
      //   已持久化的老行只有旧字段;不迁的话 merge 拿不到值 → 回落默认 "open",
      //   运营已关的市场会随一次升级**静默重开**。旧字段名的字面量全仓仅此一处,属迁移遗留。
      const legacy = (s.config as { marketStatus?: unknown }).marketStatus;
      if ((s.config as { marketOpenState?: unknown }).marketOpenState === undefined && (legacy === "open" || legacy === "closed")) {
        merged.marketOpenState = legacy;
      }
      if (merged.marketOpenState !== "open" && merged.marketOpenState !== "closed") merged.marketOpenState = "open";
      if (!GENESIS_CLOSED_NOTICE_KEYS.includes(merged.closedNoticeKey)) merged.closedNoticeKey = "default";
      if (!Array.isArray(merged.perks) || merged.perks.length !== 4) merged.perks = emptyPerks();
      if (!Array.isArray(merged.opsListings)) merged.opsListings = [];
      if (!Array.isArray(merged.fomoActivity)) merged.fomoActivity = [];
      return { config: merged, ok: true };
    } catch {
      // 读已经成功了(源可用),走到这里说明是**解析/合并**炸了(脏值等)——
      // 那是脏值不是源不可达,按 fail-open 回默认值放行,与上面的 fail-closed 分工不同。
      return { config: freshDefaults(), ok: true };
    }
  }
  // 读回空:分不清「从没存过」与「源挂了」,这时才需要往返探针来定这一分。
  return storageReadable()
    ? { config: freshDefaults(), ok: true }    // 首次运行:没存过 ≠ 拉取失败
    : { config: freshDefaults(), ok: false };  // 源不可达 → configUnavailable 保守锁购
}

export const useGenesisConfig = defineStore("genesisConfig", () => {
  const initial = freshDefaults();
  initial.marketOpenState = "closed";
  initial.tiers = [];
  initial.opsListings = [];
  initial.fomoActivity = [];
  initial.fomoEnabled = false;
  initial.showcaseEnabled = false;
  const config = ref<GenesisConfig>(initial);
  /** 配置是否可用 —— 由**最近一次读源的真实结果**驱动,不写死。
   *  false 时 `genesisPurchaseBlock` 返回 `configUnavailable` 保守锁购;
   *  `refresh()` 成功即恢复(= 规格异常3 的「重试」)。 */
  const loaded = ref(false);
  let refreshGeneration = 0;

  /**
   * 🔴 重新读配置源。这是关闭态能约束**已打开会话**的关键(独立验收 P0→P1):
   *   config 只在 store 构造时读一次的话,运营切了状态,已开着页面的用户照旧能买
   *   (实测 hash 导航 + 不刷新完成 $23,998 认购)。三类调用点:
   *   ① 创世相关页面 onShow —— UI 跟上最新状态;
   *   ② composable 挂载时 —— 组件级消费者(首页快捷入口/商城卡)进场即取新;
   *   ③ 🔴 store 资金动作入口(purchase / listNode / acquireSecondary)——
   *      动钱前**必再读一次**,这是 mock 期对「服务端拒单」的忠实模拟:
   *      判定读的不再是构造时的内存快照,而是当下的权威源。
   */
  async function refresh() {
    const generation = ++refreshGeneration;
    // 🔴🔴 mock 模式没有服务端可读,而下面的 catch 是 **fail-closed**(把市场钉成 closed、
    //   loaded 置 false)。少了这个分支,mock 下 refresh 必然走进 catch ⇒
    //   `genesisPurchaseBlock` 先判 `!configLoaded → configUnavailable`,创世**整条流程**
    //   (购买 / 挂单 / 承接 / 展示)全被钉死在「市场暂未开放」。
    //   mock 期的「服务端」就是内置默认配置:标记就绪 + 开市,其余字段沿用 DEFAULT_GENESIS_CONFIG。
    //   fail-closed 只对**真的有服务端却读不到**的情形成立;没有服务端的构建不适用。
    if (!remoteApiEnabled) {
      config.value = { ...config.value, marketOpenState: "open" };
      loaded.value = true;
      return;
    }
    try {
      const state = await genesisApi.state();
      if (generation !== refreshGeneration) return;
      config.value = {
        ...config.value,
        halted: state.halted,
        killSwitchRevision: state.revision,
        killSwitchSource: state.source,
        tiers: state.tiers.map((tier) => ({ ...tier })),
        marketOpenState: state.marketOpenState,
        closedNoticeKey: GENESIS_CLOSED_NOTICE_KEYS.includes(state.closedNoticeKey as GenesisClosedNoticeKey)
          ? state.closedNoticeKey as GenesisClosedNoticeKey
          : "default",
        saleStartAt: state.sale.startAt,
        showCountdown: state.sale.showCountdown,
        showcaseEnabled: state.showcaseEnabled,
      };
      loaded.value = true;
    } catch {
      if (generation !== refreshGeneration) return;
      config.value = {
        ...config.value,
        halted: true,
        killSwitchRevision: "unavailable",
        killSwitchSource: "remote-unavailable",
        marketOpenState: "closed",
        tiers: [],
        showcaseEnabled: false,
      };
      loaded.value = false;
    }
  }

  return { config, loaded, refresh };
});
