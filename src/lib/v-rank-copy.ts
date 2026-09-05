// V 级晋升缺口的本地化文案。
//
// 为什么要这一层(2026-08-17,英文文案哨兵配套):`nextRankProgress` 原来直接返回**英文句子**
// (`missing: string[]`,里面是 `Self-buy $299 more` / `3 more direct invites`),两个消费点
// (首页 V 级卡、团队 V 级页)原样渲染 —— 中文 / 越南语界面直出英文,而 `t.rank.need*` 四条
// 三语文案早就写好、全仓 0 引用(死键)。同一个文件里的 `PrimaryGap` 判别联合已经是「store 返回
// 结构、UI 负责措辞」的正确形状,`missing` 是唯一没跟上的那条。
//
// 缺口结构定义在 store(`@/store/v-rank` 的 `RankGap`),措辞在这里 —— 与 product-copy.ts /
// device-copy.ts 同一分层约定。
import type { Messages } from "@/i18n/messages/en";
import type { RankGap, VRankDef } from "@/store/v-rank";
import { fmt } from "@/i18n/format";

/**
 * V 级头衔的显示名。中文界面用 `cnTitle`(主人 2026-08-17 拍板:V3 = 舰长),其余语言用英文权威名
 * (`title`;越南语没有独立头衔表)。此前这条判断在 `network-card.vue` / `rank-how.vue` / `network.vue`
 * 各写一份、而 V 级页阶梯 / 领导池 / 团队页 / V 徽章压根没判 —— 同一个头衔在中文界面出现过
 * 「舰长 / 队长 / Captain」三种写法。收成一处,谁渲染头衔都从这里取。
 *
 * 🔴 **档位表必须由调用方传进来**,不许在这里直读 `V_RANKS` —— 那张表源码明写 `⚠️ MOCK-ONLY`,
 * 而 store 的 `ladder` 在 remote 档是**空数组**(权威档位由服务端给)。直读 mock 表的后果是
 * 「接上真后端后页面照旧显示 mock 头衔」,本地永远看不出来(独立验收 2026-08-17 抓到)。
 * 取不到档位就只给 `V{n}`,由调用方决定要不要显示更明确的未知态。
 */
export function rankTitle(v: number, isZh: boolean, ladder: readonly VRankDef[]): string {
  const def = ladder[v];
  if (!def) return "";
  return (isZh && def.cnTitle) || def.title;
}

/** `V3 舰长` / `V3 Captain` —— 阶梯行、解锁句、进度头都用这个拼法;档位未知时只给 `V3`。 */
export function rankLabel(v: number, isZh: boolean, ladder: readonly VRankDef[]): string {
  const title = rankTitle(v, isZh, ladder);
  return title ? `V${v} ${title}` : `V${v}`;
}

/** 一条晋升缺口 → 当前语言的一句话。 */
export function rankGapText(t: Messages, gap: RankGap, isZh: boolean, ladder: readonly VRankDef[]): string {
  switch (gap.kind) {
    case "selfBuy":
      return fmt(t.rank.needSelfBuy, { n: gap.amount.toLocaleString() });
    case "directRefs":
      // 🔴 英文单复数:改成读词典时我漏了旧码的 `invite${n === 1 ? "" : "s"}`,n=1 渲染成
      //    「1 more direct invites」(独立验收抓到,我先前「en 逐字未变」那句话对 n=1 是错的)。
      //    仓内没有复数机制,按最小等价补一条单数键;zh / vi 不变形,两键同值。
      // 🔴 两个 fmt() 分开写,不把三元塞进 fmt 的实参:`selfcheck-i18n-interp` 判「带占位符的
      //    文案必须**词法上**裹在 fmt( 里」,三元穿在参数里它看不穿 —— 门的形状是对的
      //    (词法判据才抗变异),该改的是我的写法。
      if (gap.n === 1) return fmt(t.rank.needRefsOne, { n: gap.n });
      return fmt(t.rank.needRefs, { n: gap.n });
    case "teamVolume":
      return fmt(t.rank.needTeam, { n: gap.amount.toLocaleString() });
    case "vDownlines":
      return fmt(t.rank.needV, { n: gap.n, title: rankTitle(gap.vLevel, isZh, ladder), v: gap.vLevel });
  }
}

/** 一阶 V 级的达成条件 → 当前语言的一句话(条件之间用 ` + ` 连,无条件时给「注册即得」)。 */
export function rankConditionsText(t: Messages, conds: {
  selfBuyUSD?: number;
  directRefs?: number;
  teamVolumeUSD?: number;
  vDownlines?: Record<string, number>;
}): string {
  const parts: string[] = [];
  if (conds.selfBuyUSD) parts.push(fmt(t.rank.cond.selfBuy, { n: conds.selfBuyUSD.toLocaleString() }));
  if (conds.directRefs) parts.push(fmt(t.rank.cond.directRefs, { n: conds.directRefs }));
  if (conds.teamVolumeUSD) parts.push(fmt(t.rank.cond.teamVol, { n: conds.teamVolumeUSD.toLocaleString() }));
  if (conds.vDownlines) {
    for (const [v, n] of Object.entries(conds.vDownlines)) parts.push(fmt(t.rank.cond.vDownlines, { n, v }));
  }
  return parts.length ? parts.join(" + ") : t.rank.cond.register;
}
