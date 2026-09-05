import { ref, computed, onMounted, onUnmounted, type ComputedRef } from "vue";
import {
  useGenesisConfig,
  isPreSale,
  genesisPurchaseBlock,
  genesisShowsUrgency,
  genesisSecondaryBlock,
  type GenesisPurchaseBlock,
} from "@/store/genesis-config";
import { useGenesis } from "@/store/genesis";
import { useT } from "@/i18n/use-t";

/**
 * useGenesisSaleGate — 创世购买可用性的**唯一消费入口**(规格 FEAT-GEN09 + FEAT-GEN10)。
 *
 * 判定本体是纯函数 `genesisPurchaseBlock`(store/genesis-config.ts),本 composable
 * 只负责把响应式输入喂给它 + 提供秒级 tick 让倒计时与到点解锁实时生效。
 *
 * 🔴 **页面不许自己再判一次**。改造前「能不能买」在创世页的按钮文案与点击处理里
 * 各写了一套 if 链,顺序一致纯属巧合;任一处加条件而另一处忘改,就会出现
 * 「按钮写着可买、点了没反应」或「按钮灰着却能点进结算」。机器门:
 * `scripts/selfcheck-genesis-gate.mjs`。
 *
 * MOCK-ONLY:marketOpenState / saleStartAt / showCountdown 均 server-canonical(admin G4)。
 */
export interface UseGenesisSaleGateResult {
  /** 最高优先级的阻断原因;`null` = 可购买。页面据此出文案与行为,不再自判。 */
  block: ComputedRef<GenesisPurchaseBlock>;
  /** 二级市场(承接他人挂单)的阻断原因。
   *
   *  与主售的差别只有一处:**二级不受主售名额与开售时间影响** —— 卖的是别人手里的存量,
   *  主售售罄或未开售都不妨碍转让。所以这里把那两档喂成「恒不命中」,
   *  而不是靠调用方漏判来「碰巧不拦」。
   *  🔴 放在 composable 里是为了让 store 的 `acquireSecondary` 与本页**共用同一套口径**;
   *  上一版页面自己写 `marketClosed`、store 自己写另一套条件,两处早已不一致(验收 P1-5/P1-6)。 */
  secondaryBlock: ComputedRef<GenesisPurchaseBlock>;
  /** 市场关闭态(= block === "marketClosed"),给需要单独渲染关闭说明的地方用。 */
  marketClosed: ComputedRef<boolean>;
  /** 是否允许展示紧迫感元素(倒计时 / 剩余名额)。关闭态与售罄态一律 false。 */
  showUrgency: ComputedRef<boolean>;
  /** 关闭态文案变体键(默认 "default")。 */
  closedNoticeKey: ComputedRef<string>;
  /**
   * 三档**阻断说明**文案的唯一出口:`configUnavailable` / `marketClosed` / `halted`。
   *
   * 🔴 只管这三档,其余档返回 `null` —— 因为 `soldOut` / `preSale` / 可购买态的措辞
   *    **各面本就不同**(创世页售罄说「已售罄」、商城卡说「去二级市场」),那是各面的
   *    CTA 词汇,不是重复。把五档一起合并会把商城卡的售罄文案悄悄改掉。
   *
   * 🔴 返回 `null` 而不是兜底成 `marketClosed.default`:上一版有两处靠 `default:` 兜住
   *    可购买态(block 为 null 时也算出一句「市场暂未开放」),只因外层另有闸挡着才没露出来。
   *    返回 null 让调用方必须显式处理自己的档,那种「靠外层碰巧挡住」的写法会当场暴露。
   */
  blockText: ComputedRef<string | null>;
  /** 未开售(预售锁定态)。到点自动翻 false。 */
  preSale: ComputedRef<boolean>;
  /** 是否显示倒计时具体时间。**关闭态下恒 false**(规格 ④:不对不可购买的东西制造紧迫感)。 */
  showTime: ComputedRef<boolean>;
  /** 倒计时天数(0 时不显天)。 */
  countdownDays: ComputedRef<number>;
  /** 倒计时时分秒 HH:MM:SS。 */
  countdownClock: ComputedRef<string>;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 秒级共享时钟(倒计时与到点解锁用)。
 *
 * 🔴 **模块级 + 引用计数,不是每实例一个** —— 本 composable 的消费者里有
 *   `MyTokenCard`,它在二级市场「我的」页签里按持仓数 `v-for` 渲染(上限 5 张)。
 *   每实例一个定时器 = 5 张卡 5 个秒级 timer,各自 tick 都触发一轮 computed 失效,
 *   而那张卡**根本不渲染倒计时**(实测:2 张卡确实起了 2 个 1000ms timer)。
 *   时钟本就是全局事实,不是每个消费者各有一份。
 */
const nowTs = ref(Date.now());
let clockRefs = 0;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let tickCount = 0;

/** 配置重读周期(秒)。挂在已有的秒级时钟上,**不另起定时器**。 */
const CONFIG_POLL_TICKS = 15;

function retainClock() {
  clockRefs += 1;
  if (clockTimer === null) {
    nowTs.value = Date.now(); // 首个消费者进场即对时,不等第一个 tick
    tickCount = 0;
    clockTimer = setInterval(() => {
      nowTs.value = Date.now();
      // 🔴 「用户停在页面上不动」也要跟上运营的状态切换(规格 ⑤「就地转为锁定态」)。
      //   此前只有导航 / 下拉 / 硬刷新三条路径会重读 —— 干等不动时 UI 一直是旧的,
      //   用户要点一下被拒才知道,而规格要的是提前变灰(运行时探针 ⑦a 实测红)。
      //   🔴 挂在已有时钟上按 15 tick 触发,不另起 timer:轮询代价 = 每 15s 一次读盘,
      //   而每实例一个新 timer 的代价随列表长度翻倍(同文件上一版刚踩过)。
      //   真后台接上后这里换成 SSE / 长轮询,周期语义不变。
      tickCount += 1;
      if (tickCount % CONFIG_POLL_TICKS === 0) useGenesisConfig().refresh();
    }, 1000);
  }
}
function releaseClock() {
  clockRefs = Math.max(0, clockRefs - 1);
  if (clockRefs === 0 && clockTimer !== null) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
}

export function useGenesisSaleGate(): UseGenesisSaleGateResult {
  const cfg = useGenesisConfig();
  const genesis = useGenesis();

  // 🔴 retain / release 必须一一对应(2026-08-05 独立验收 P2)。
  //   直接把 releaseClock 挂上 onUnmounted 的话,「没 mount 却触发 unmount」的情形
  //   (Suspense / async setup)会把 clockRefs 多减一次 —— 于是仍挂载着的其它消费者
  //   倒计时集体冻结、15s 配置轮询停摆。`Math.max(0, …)` 只防负数,防不住提前归零。
  //   仓内今天没有 Suspense,属潜伏;一个组件级布尔就焊死,不留给以后。
  let clockHeld = false;
  onMounted(() => {
    // 🔴 消费者进场即重读配置源(hydrate-once 修复的 UI 面):config 是共享 Pinia store,
    //   任一消费者 refresh,所有已挂载消费者的 computed 一起更新。
    cfg.refresh();
    clockHeld = true;
    retainClock();
  });
  onUnmounted(() => {
    if (!clockHeld) return;
    clockHeld = false;
    releaseClock();
  });

  const block = computed(() =>
    genesisPurchaseBlock({
      configLoaded: cfg.loaded,
      marketOpenState: cfg.config.marketOpenState,
      // 🔴 熔断槽位:前端目前无生产者(后台 J1 有 genesis 闸但未接线),恒 false。
      //   理由与「为什么不删这个参数」写在 genesis-config.ts 的 GenesisPurchaseInput.halted。
      halted: false,
      remaining: genesis.totalSlots - genesis.soldSlots,
      saleStartAt: cfg.config.saleStartAt,
      now: nowTs.value,
    }),
  );

  // 走共享纯函数,与 store 的 acquireSecondary 同一套输入口径(见其定义处的注释)。
  const secondaryBlock = computed(() =>
    genesisSecondaryBlock({ loaded: cfg.loaded, marketOpenState: cfg.config.marketOpenState, now: nowTs.value }),
  );

  const marketClosed = computed(() => block.value === "marketClosed");
  const showUrgency = computed(() => genesisShowsUrgency(block.value));
  const closedNoticeKey = computed(() => cfg.config.closedNoticeKey);

  // 三档阻断说明的**唯一映射出口**。改造前这段 switch 在 4 个页面各写了一份
  // (还有 2 个页面连写都没写、直接写死 `.default`,于是售罄时说成「暂未开放」,
  //  与创世页同刻互相矛盾 —— 独立验收 P1-3)。合并到这里之后没有第二处能写错。
  const t = useT();
  const blockText = computed<string | null>(() => {
    const notices = t.value.genesis.marketClosed;
    switch (block.value) {
      case "configUnavailable":
        return notices.configUnavailable;
      case "halted":
        return notices.halted;
      case "marketClosed":
        // 变体键来自后台下拉白名单;取不到时回落 default(hydrate 已做白名单校验,这里是二道保险)。
        return notices[closedNoticeKey.value as "default"] ?? notices.default;
      default:
        // soldOut / preSale / 可购买 —— 各面措辞不同,由调用方自己出。
        return null;
    }
  });

  const preSale = computed(() => isPreSale(cfg.config.saleStartAt, nowTs.value));
  // 🔴 倒计时受 showUrgency 闸:市场关闭时即使 saleStartAt 还没到,也不显示倒计时。
  const showTime = computed(
    () => showUrgency.value && preSale.value && cfg.config.showCountdown && cfg.config.saleStartAt != null,
  );

  const remainMs = computed(() => {
    const start = cfg.config.saleStartAt;
    if (start == null) return 0;
    return Math.max(0, start - nowTs.value);
  });
  const countdownDays = computed(() => Math.floor(remainMs.value / 86400_000));
  const countdownClock = computed(() => {
    const totalSec = Math.floor(remainMs.value / 1000);
    const hh = Math.floor((totalSec % 86400) / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  });

  return { block, secondaryBlock, marketClosed, showUrgency, closedNoticeKey, blockText, preSale, showTime, countdownDays, countdownClock };
}
