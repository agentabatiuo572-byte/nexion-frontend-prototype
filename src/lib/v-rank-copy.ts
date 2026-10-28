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
import { publishedRankTitle } from "@/i18n/rank-titles";
import type { RankGap, VRankDef } from "@/store/v-rank";
import { fmt } from "@/i18n/format";
import { HAN_SCRIPT_RE } from "@/lib/native-unicode-regex";
import { formatHowNumber } from "./rank-how-content";

const CULTIVATION_COPY = {
  zh: {
    title: "成员成长奖励",
    trigger: "直接邀请的成员晋升至 V{n} 时，对应奖励为 {amount}；到账状态以奖励记录为准。",
    recipient: "奖励发给晋升者的推荐人；无推荐人时，由晋升者本人获得。",
  },
  en: {
    title: "Member growth reward",
    trigger: "When a directly invited member reaches V{n}, the corresponding reward is {amount}; payment status follows the reward records.",
    recipient: "The reward goes to the promoted member’s referrer. If there is no referrer, the promoted member receives it.",
  },
  vi: {
    title: "Thưởng phát triển thành viên",
    trigger: "Khi thành viên được mời trực tiếp đạt V{n}, phần thưởng tương ứng là {amount}; trạng thái chi trả theo bản ghi thưởng.",
    recipient: "Phần thưởng được trả cho người giới thiệu của thành viên thăng hạng. Nếu không có người giới thiệu, thành viên thăng hạng tự nhận thưởng.",
  },
};

export function rankCultivationCopy(locale: string) {
  return CULTIVATION_COPY[locale.split("-")[0] as keyof typeof CULTIVATION_COPY] ?? CULTIVATION_COPY.en;
}

/**
 * F1 正式公开等级名称。服务端目前把同一中文配置写入 title/cnTitle，
 * 英文、越文显示时只按完全匹配的正式中文名翻译；动态自定义名不猜测。
 *
 * 🔴 **档位表必须由调用方传进来**,不许在这里直读 `V_RANKS` —— 那张表源码明写 `⚠️ MOCK-ONLY`,
 * 而 store 的 `ladder` 在 remote 档是**空数组**(权威档位由服务端给)。直读 mock 表的后果是
 * 「接上真后端后页面照旧显示 mock 头衔」,本地永远看不出来(独立验收 2026-08-17 抓到)。
 * 取不到档位就只给 `V{n}`,由调用方决定要不要显示更明确的未知态。
 */
export function rankName(def: Pick<VRankDef, "title" | "cnTitle">, locale: LocaleCode): string {
  if (locale === "zh") return def.cnTitle || def.title;
  if (locale === "vi") {
    const vietnamese = publishedRankTitle(def.cnTitle, locale) || publishedRankTitle(def.title, locale);
    if (vietnamese) return vietnamese;
  }
  if (!HAN_SCRIPT_RE.test(def.title)) return def.title;
  return publishedRankTitle(def.title, locale) || publishedRankTitle(def.cnTitle, locale);
}

export function rankTitle(v: number, locale: LocaleCode, ladder: readonly VRankDef[]): string {
  const def = ladder[v];
  if (!def) return "";
  return rankName(def, locale);
}

/** `V3 一星大使` / `V3 One-Star Ambassador` —— 档位未知时只给 `V3`。 */
export function rankLabel(v: number, locale: LocaleCode, ladder: readonly VRankDef[]): string {
  const title = rankTitle(v, locale, ladder);
  return title ? `V${v} ${title}` : `V${v}`;
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
