// 任务「能不能真的去完成」——**业务可用性**判据(纯函数,单一宿主)。
//
// ══ 为什么需要它(BUG 127 / 155)═══════════════════════════════════════════════
// 服务端下发的任务里带着一条 `actionRoute`(PC H3 配置,白名单校验过:见
// api/quest-api.ts 的 normalizeQuestActionRoute)。客户端从 2026-08-12 起只渲染
// 「服务端派了什么」,不再决定「派不派」——这是对的:questCode 是运营手输的自由
// 文本,客户端按字符串猜「这条任务指向哪个业务动作」在两个方向上代价不对称。
//
// 但 `actionRoute` **不是自由文本**,它是客户端路由白名单里的枚举值;而每条路由
// 背后那个业务的可用开关,App 今天拿得到(质押池 enabled/killed、兑换 caps.swapEnabled、
// 创世闸)。于是一个**窄得多**的判断成立了:
//   「这条任务指向的页面,现在整体不可用吗?」
// 判「不可用」时才停——不能完成的任务卡片继续给「去完成」,就是把用户送进一个
// 他立刻会撞上的墙(BUG 127/155 的实测形态:四个质押方案全部「暂停售卖」、
// 兑换页明说「当前平台设置已暂停兑换」,任务卡还在倒计时并给按钮)。
//
// ══ 边界:为什么这不是「客户端过滤」(为什么与 lib/quest-genesis-tripwire.ts 不冲突)══
// 那道闸拒绝的是**按 questCode/name 字符串猜创世语义**(猜错会藏掉一条 CLAIMABLE
// 的任务 = 扣掉用户已挣到的奖励)。这里的输入是**类型化路由**,而且:
//   · 只作用于 PENDING(见消费方:COMPLETED/CLAIMABLE/CLAIMED 一律不碰);
//   · 只判「**整个业务域**现在是否整体不可用」,不判单条任务完成没完成;
//   · 判据来源是真实业务页读到的同一个开关,不是文本启发式。
// 因此它不会把一条已挣到的奖励藏掉,也不会因为改名而误判。
//
// ══ 未知 = 不能指控 ══════════════════════════════════════════════════════════
// 读不到开关(请求失败 / 尚未就绪)一律 `null` = 不知道 = **照常展示可完成**。
// 反过来(不知道就停)会把一次网络抖动变成「用户以为任务被下掉了」。这条与
// quest-genesis-tripwire 顶部「configUnavailable 不是指控依据」同源。
import type { CanonicalQuest } from "@/api/quest-api";

export type QuestActionDomain = "staking" | "exchange" | "genesis-primary" | "genesis-secondary";

/**
 * 任务路由 → 业务域。未知路由返回 `null`(不是缺陷:白名单里大多数业务今天没有开关)。
 *
 * 🔴 只映射**整体可用**会被关掉的那三个域。`/pages/genesis/genesis` 下单是主要
 *   动作,`/pages/genesis/marketplace` 是承接他人挂单 —— 两者在闸上不是同一档
 *   (`genesisSecondaryBlock` 不受主售售罄影响),所以是两个域,不是一个。
 */
export function questActionDomain(actionRoute: string): QuestActionDomain | null {
  const path = actionRoute.split("?")[0];
  if (path === "/pages/staking/staking") return "staking";
  if (path === "/pages/me/wallet-exchange") return "exchange";
  if (path === "/pages/genesis/genesis") return "genesis-primary";
  if (path === "/pages/genesis/marketplace") return "genesis-secondary";
  return null;
}

// ── 目标域判据(消费方:use-quest-target-availability,喂报警器)────────────────
// 与上面的「路由 → 域」同源:这里只回答「这条任务指向哪个业务」,不回答「能不能点」。
// 判据仍走 actionRoute(类型化白名单),不走 questCode / name 的自由文本。

export type QuestTargetBusiness = "staking" | "exchange" | "genesis";

/** 这条任务指向哪个业务;`null` = 不指向受管业务(或路由不在白名单)。 */
export function questTargetBusiness(quest: Pick<CanonicalQuest, "actionRoute">): QuestTargetBusiness | null {
  const domain = questActionDomain(quest.actionRoute);
  if (domain === "staking") return "staking";
  if (domain === "exchange") return "exchange";
  // 主售与二级都算「创世」这一面:一条买创世的任务与一条逛二级的任务,在
  // `genesisBlockIsKnownUnavailable` 下的报警口径一致(售罄档二级仍可用,报警器
  // 只看「确定不可用」的档,多余报一次也不会藏掉已得奖励 —— 它只打日志)。
  if (domain === "genesis-primary" || domain === "genesis-secondary") return "genesis";
  return null;
}

/** 三个业务面的当前可用性。`false` = 可用或未知(**不知道就别说**)。 */
export interface QuestTargetAvailability {
  genesisBlocked: boolean;
  stakingClosed: boolean;
  exchangeClosed: boolean;
}

/** 服务的当前状态(用户自己的)是否仍可用。 */
function targetUnavailable(quest: Pick<CanonicalQuest, "actionRoute">, availability: QuestTargetAvailability): boolean {
  switch (questTargetBusiness(quest)) {
    case "staking": return availability.stakingClosed;
    case "exchange": return availability.exchangeClosed;
    case "genesis": return availability.genesisBlocked;
    default: return false;
  }
}

/**
 * 服务端派了、而本地开关说「现在做不了」的任务。
 *
 * 🔴 只算 PENDING —— COMPLETED / CLAIMABLE 是用户**已经挣到**的奖励,
 *   业务关不关都得让他领;把它算进来,顺着报警做过滤就等于扣掉用户已得的奖励。
 * 🔴 这是**报警不是过滤**(过滤归派发端,见 lib/quest-genesis-tripwire.ts 顶部):
 *   questCode / name 是运营手输的自由文本,客户端只能按字符串猜,猜错的代价不对称。
 */
export function unclaimableBusinessQuests(
  quests: readonly CanonicalQuest[],
  availability: QuestTargetAvailability,
): CanonicalQuest[] {
  return quests.filter((quest) => quest.status === "PENDING" && targetUnavailable(quest, availability));
}

/** 报警文案(ASCII —— 它进 console / 探针日志,不上屏)。 */
export function questBusinessContractViolation(
  offenders: readonly CanonicalQuest[],
  availability: QuestTargetAvailability,
): string {
  const closed = (Object.entries(availability) as [string, boolean][])
    .filter(([, unavailable]) => unavailable).map(([name]) => name).join(", ");
  const codes = offenders.map((quest) => quest.questCode).join(", ");
  return `[quest-business] server dispatched ${offenders.length} unachievable quest(s) `
    + `while ${closed || "no"} business target is closed: ${codes}. `
    + "The dispatcher must not emit quests whose target business is currently unavailable.";
}
