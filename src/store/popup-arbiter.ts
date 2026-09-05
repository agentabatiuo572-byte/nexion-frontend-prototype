import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * 自动弹层占屏仲裁 —— 全站「同一时刻只允许一个会吃交互的浮层占屏」的唯一裁决点。
 *
 * 背景(2026-08-16 独立走查实测):首页里程碑庆祝浮层叠在已弹出的代金券领取弹层
 * 正上方并模糊背景数十秒;换语言重进首页时试用弹层抢在代金券之前。根因不是某处
 * 写错,而是每个弹出面各自判断该不该弹 —— 互斥靠两两手写 `!对方.open`,全站只有
 * 代金券↔试用这一对,加第三个面(庆祝)时没人补,于是它对谁都不让。
 *
 * 🔴 裁决必须住在 store 里,不能写进宿主组件:全站 80 个页面共用 app-chassis,
 * 而 uni 在页面栈里**不卸载**被压住的页面(只 display:none),全局浮层宿主又挂在
 * chassis 内部 —— 页面栈深 N 就有 N 份宿主各跑各的定时器,读的却是同一份 store。
 * 组件里判断会有 N 份副本同时判断;store 里判断天然收敛到一份。
 *
 * 本 store **只管「此刻谁占屏」**,不碰「多久能再弹一次」—— 各弹出面自己的
 * cooldownHours / maxPerSession / 持久化键原样留在各自 store 里,一行不改。
 *
 * Real backend: 优先级表随 auto-push 配置下发(与 trial-config 的 autoPush* 同口径,
 * PRD §9.11b),运营可调而不发版;客户端常量只作为拉取失败时的兜底。
 */

/**
 * 会吃交互(铺遮罩、挡住底下按钮)的自动弹出面,**按优先级从高到低**。
 * 主人 2026-08-16 拍板 A1:代金券 → 试用 → 庆祝。
 *
 * 🔴 顺序即优先级。改这个数组就是改漏斗顺序 —— 不再靠「延迟数字谁小谁先」
 * 隐式表达(旧写法 1300ms vs 1500ms,任何人调延迟都会不知情地改掉漏斗顺序)。
 */
export const POPUP_PRIORITY = ["voucher-claim", "trial-claim", "milestone"] as const;

export type PopupId = (typeof POPUP_PRIORITY)[number];

export interface AutoPushCandidate {
  id: PopupId;
  /** 资格 —— 在**触发时**复算,不在挂载时锁死。 */
  eligible: () => boolean;
  /**
   * 判据依赖的数据是否已到货。🔴 与 eligible 是两件事:`eligible=false` 有两种含义 ——
   * 「数据还没回来,暂时判不出」与「判出来了,确实不够条件」。只看 eligible 会让
   * **低优先级的面抢跑**(remote 档下代金券目录异步到货,安顿点它 eligible=false,
   * 试用立刻上位 —— 正是「换语言重进首页试用抢在代金券前」的成因)。
   */
  ready: () => boolean;
  /** 尝试弹出;各自的 cooldownHours / maxPerSession 由各自 store 判定,本层不碰。 */
  push: () => boolean;
}

/**
 * 按 POPUP_PRIORITY 评一轮。返回 true = 该停表(有人弹出来了 / 已无需再评)。
 *
 * 🔴 放在 store 层而不是 .vue 里,是为了让机器门能测**正主**:埋在组件里时门只能
 * 用正则猜写法,而正则对改名 / 挪位 / 装饰性保留一概判绿(P-104/P-106 同族)。
 * 依赖以**存取函数**注入(而不是直接收一个 store 对象),这样测试里的 stub 与真
 * pinia 的 ref 解包差异不会渗进判据。
 */
export function runPriorityRound(args: {
  currentHolder: () => PopupId | null;
  acquire: (id: PopupId) => boolean;
  release: (id: PopupId) => void;
  candidates: ReadonlyArray<AutoPushCandidate>;
  /** 仍在安顿等待窗口内 —— 高优先级的面未就绪时是否要整轮让位给它。 */
  waitForReady: boolean;
}): boolean {
  // 🔴 C1 先到先得,且这道判断必须**先于一切**、放在循环外:
  // acquire 对同一个 id 幂等,若屏上那个(例如用户从 banner 手动打开的代金券)恰好
  // 就是本轮候选,循环里的 acquire 会"成功",而 push 因冷却失败后那句 release 会把
  // **别人正持有的**令牌抹掉,下一个候选随即叠上去 —— B1「同屏只一个」当场破。
  if (args.currentHolder() !== null) return false;
  for (const id of POPUP_PRIORITY) {
    const candidate = args.candidates.find((c) => c.id === id);
    // 庆祝浮层在优先级表里但不由底盘推送(它有自己的队列宿主);它占屏的情况
    // 已被上面那道早退挡住。
    if (!candidate) continue;
    if (!candidate.eligible()) {
      // 数据没到货 ≠ 不够条件:高优先级的面未就绪时**整轮让位给它**,不许低优先级
      // 抢跑;等待有上限,窗口到点它仍不就绪才轮到下一个。
      if (!candidate.ready() && args.waitForReady) return false;
      continue;
    }
    if (!args.acquire(candidate.id)) return false;
    if (candidate.push()) return true;
    // 冷却没过 / 会话次数用完 → 还回**本轮刚拿到的**令牌,让位给下一个候选。
    args.release(candidate.id);
  }
  return false;
}

export const usePopupArbiter = defineStore("popupArbiter", () => {
  /** 此刻占屏的面;null = 空屏,谁都可以申请。会话态,不持久化(持久化会跨 reload 死锁)。 */
  const current = ref<PopupId | null>(null);

  /**
   * 本次进首页的「自动弹层名额」是否已用掉。主人 2026-08-16 拍板 B1「一次进首页只弹一个」。
   * 🔴 单靠底盘那条「评出赢家即停表」**不足以**兑现 B1 —— 停表只停得住底盘推送的两条腿,
   * 而庆祝浮层有自己独立的泵、从不经过那张表:赢家一关闭,下一拍(≤300ms)庆祝就接着上屏,
   * 独立审计实测「1 张领取弹层 + 3 张全屏庆祝、合计约 18 秒遮挡」。所以名额要显式记。
   * 由底盘在每次进首页时 beginHomeVisit() 复位。
   */
  const visitClaimed = ref(false);

  /** 进首页 = 新的一轮名额。 */
  function beginHomeVisit() {
    visitClaimed.value = false;
  }

  /**
   * 申请占屏。主人 2026-08-16 拍板 C1「永不顶替,先到先得」——
   * 已经有别人占着就直接失败,**不比优先级、不抢屏**:高优先级的面晚到也只能等,
   * 绝不在用户手指伸向按钮的瞬间把弹层换成别的。
   * 同一个 id 重复申请视为成功(幂等 —— N 份宿主副本会各调一次)。
   */
  function acquire(id: PopupId): boolean {
    if (current.value !== null && current.value !== id) return false;
    current.value = id;
    visitClaimed.value = true;
    return true;
  }

  /** 归还占屏。只有持有者能归还 —— 防止 A 关闭时顺手把 B 刚拿到的令牌抹掉。 */
  function release(id: PopupId) {
    if (current.value === id) current.value = null;
  }

  /** 除 `self` 外是否有人占屏 —— 宿主用它判断「这一轮该不该让路」。 */
  function busyForOthers(self: PopupId): boolean {
    return current.value !== null && current.value !== self;
  }

  return { current, visitClaimed, beginHomeVisit, acquire, release, busyForOthers };
});
