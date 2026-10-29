import { teamLogicCopy } from "@/i18n/team-logic-copy";
import { computePointsCopy, formatComputePoints } from "@/i18n/compute-points";
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
import type { LocaleCode } from "@/i18n";
import type { RankGap, VRankDef } from "@/store/v-rank";
import { fmt } from "@/i18n/format";
import { formatHowNumber } from "./rank-how-content";

const CULTIVATION_COPY = {
  zh: {
    title: "好友升级奖励",
    trigger: "好友升到 V{n} 时，你可获得 {amount}。",
    recipient: "奖励发给邀请这位好友的人。",
  },
  en: {
    title: "Friend rank-up reward",
    trigger: "When a friend reaches V{n}, you can earn {amount}.",
    recipient: "The reward goes to the person who invited that friend.",
  },
  vi: {
    title: "Thưởng khi bạn bè lên hạng",
    trigger: "Khi bạn bè đạt V{n}, bạn có thể nhận {amount}.",
    recipient: "Phần thưởng dành cho người đã mời người bạn đó.",
  },
};

export function rankCultivationCopy(locale: string) {
  return CULTIVATION_COPY[locale.split("-")[0] as keyof typeof CULTIVATION_COPY] ?? CULTIVATION_COPY.en;
}

/**
 * 2026-10-29 文案审查 D6:App 只显示 V 级(V0–V8),不显示后台配置的头衔。
 * 头衔字段(title / cnTitle)留给运营内部使用;这里统一返回空串,调用方按空串隐藏头衔。
 */
export function rankName(_def: Pick<VRankDef, "title" | "cnTitle">, _locale: LocaleCode): string {
  return "";
}

export function rankTitle(_v: number, _locale: LocaleCode, _ladder: readonly VRankDef[]): string {
  return "";
}

/** 等级标签只给 `V3`。 */
export function rankLabel(v: number, _locale: LocaleCode, _ladder: readonly VRankDef[]): string {
  return `V${v}`;
}

/** 一条晋升缺口 → 当前语言的一句话。 */
export function rankGapText(t: Messages, gap: RankGap, locale: LocaleCode, ladder: readonly VRankDef[]): string {
  switch (gap.kind) {
    case "selfComputePoints":
    case "teamComputePoints":
      if (gap.amount === undefined) return computePointsCopy(locale).conditionsPending;
      return (gap.kind === "selfComputePoints" ? computePointsCopy(locale).needSelf : computePointsCopy(locale).needTeam)
        .replace("{n}", formatComputePoints(gap.amount, locale));
    case "directRefs":
      // 🔴 英文单复数:改成读词典时我漏了旧码的 `invite${n === 1 ? "" : "s"}`,n=1 渲染成
      //    「1 more direct invites」(独立验收抓到,我先前「en 逐字未变」那句话对 n=1 是错的)。
      //    仓内没有复数机制,按最小等价补一条单数键;zh / vi 不变形,两键同值。
      // 🔴 两个 fmt() 分开写,不把三元塞进 fmt 的实参:`selfcheck-i18n-interp` 判「带占位符的
      //    文案必须**词法上**裹在 fmt( 里」,三元穿在参数里它看不穿 —— 门的形状是对的
      //    (词法判据才抗变异),该改的是我的写法。
      if (gap.n === 1) return fmt(t.rank.needRefsOne, { n: formatHowNumber(gap.n, locale) });
      return fmt(t.rank.needRefs, { n: formatHowNumber(gap.n, locale) });
    case "vDownlines":
      return fmt(t.rank.needV, { n: formatHowNumber(gap.n, locale), title: rankTitle(gap.vLevel, locale, ladder), v: gap.vLevel });
  }
}

/** 一阶 V 级的达成条件 → 当前语言的一句话(条件之间用 ` + ` 连,无条件时给「注册即得」)。 */
export function rankConditionsText(t: Messages, conds: {
  selfComputePoints?: number;
  teamComputePoints?: number;
  directRefs?: number;
  vDownlines?: Record<string, number>;
}, locale: LocaleCode = "en"): string {
  const parts: string[] = [];
  const pointsCopy = computePointsCopy(locale);
  if (conds.selfComputePoints !== undefined) parts.push(`${pointsCopy.self} ≥ ${formatComputePoints(conds.selfComputePoints, locale)}`);
  if (conds.directRefs) parts.push(fmt(t.rank.cond.directRefs, { n: formatHowNumber(conds.directRefs, locale) }));
  if (conds.teamComputePoints !== undefined) parts.push(`${pointsCopy.team} ≥ ${formatComputePoints(conds.teamComputePoints, locale)}`);
  if (conds.vDownlines) {
    for (const [v, n] of Object.entries(conds.vDownlines)) if (n > 0) parts.push(fmt(t.rank.cond.vDownlines, { n: formatHowNumber(n, locale), v }));
  }
  return parts.length ? parts.join(" + ") : t.rank.cond.register;
}
