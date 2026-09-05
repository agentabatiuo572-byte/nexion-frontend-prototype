// FEAT-SHARE01 分享底座 — 单源分享链接 + 渠道 intent 解析 + 分享事件与任务接线。
// 规格: PRD/specs/FEAT-SHARE01-invite-chain.md [FEAT-SHARE1]。
// 链接构造全站唯一入口(禁页面自拼 nexgrid.ai/ref/);渠道表来自 platform
// config(运营可调);分享事件 client 记录(server-canonical `share.performed`)。
import { useApp } from "@/store/app";
import { postMoneyBillsOnce, type ReceiptDraft } from "@/lib/money-receipt";
import { useConfig } from "@/store/config";
import { useQuest } from "@/store/quest";
import { toast } from "@/store/ui";
import { fmt } from "@/i18n/format";
import { useT } from "@/i18n/use-t";
import type { ShareChannelDef } from "@/store/config-types";
import { remoteApiEnabled } from "@/api/runtime";
import { useReferralReward } from "@/store/referral-reward";

// §8.1.1 邀请人回报口径:每注册好友 lifetime 贡献估值(展示用)× 阶段倍率。
// 单一常量源 — invite-earn-card 与渠道面板共用,禁再写局部镜像(F4)。
export const INVITER_REWARD_USDT_ESTIMATE = 200;
export const INVITER_REWARD_NEX = 200;

export type ShareSurface = "team_hero" | "poster_sheet" | "share_sheet" | "proof";

export interface ShareEventRecord {
  channel: string;
  surface: ShareSurface;
  sharedAt: number; // ms epoch
}

const EVENTS_KEY = "nexgrid-share-events-v1";
const EVENTS_CAP = 50;

// 单源分享链接:服务端模式只能取 H8 当前用户投影中的邀请码；该投影缺失时
// 返回空串而不是回退到浏览器 demo 身份。mock 模式仍保持原有本地演示行为。
export function currentShareReferralCode(): string {
  if (remoteApiEnabled) return useReferralReward().snapshot?.referralCode?.trim() ?? "";
  return useApp().user.referralCode.trim();
}

// 配置了 baseUrl 用短链;空(mock/dev)回退运行时 origin 直连 hash 路由。
// 无码返回空串，全部分享入口据此 fail closed。
export function buildShareLink(referralCode = currentShareReferralCode()): string {
  const code = referralCode.trim();
  if (!code) return "";
  // Remote H8 gives us the invite code, but the public platform projection does
  // not own a share-channel/base-url policy.  Do not compose a link from the
  // mock seed in that mode; the current H5 origin is the only non-business
  // transport fallback and contains no reward or channel policy.
  const base = useConfig().config.share.baseUrl;
  if (base) return `${base}${code}`;
  if (remoteApiEnabled) {
    // A missing server base URL has no business fallback; the current origin
    // is transport-only and is never composed from a mock domain.
    // #ifdef H5
    if (typeof location !== "undefined") {
      return `${location.origin}${location.pathname}#/pages/ref/code?code=${code}`;
    }
    // #endif
    return "";
  }
  // #ifdef H5
  if (typeof location !== "undefined") {
    return `${location.origin}${location.pathname}#/pages/ref/code?code=${code}`;
  }
  // #endif
  // 非 H5 且未配置 → canonical 域名兜底(F1 域名单源)。
  return `https://nexgrid.ai/ref/${code}`;
}

// 邀请文案(渠道预填):礼包金额 config 派生,en/zh 镜像模板。
export function buildShareText(): string {
  if (remoteApiEnabled) return "";
  const t = useT();
  const gift = useConfig().config.rewards.welcomeGift;
  return fmt(t.value.share.shareText, { usd: gift.usdtAmount, nex: gift.nexAmount, link: buildShareLink() });
}

// web 型渠道 intent URL({link}/{text} URL-encode 后代入);非 web 型返回 null。
export function channelIntentUrl(def: ShareChannelDef, link: string, text: string): string | null {
  if (!def.urlTemplate) return null;
  const configuredText = def.textTemplate
    ? def.textTemplate.replace("{link}", link)
    : text;
  return def.urlTemplate.replace("{link}", encodeURIComponent(link)).replace("{text}", encodeURIComponent(configuredText));
}

// 渠道可见性([FEAT-SHARE3] 平台矩阵):enabled 过滤;H5 上 system 需
// navigator.share 支持(异常2),scheme 型保留(点击走复制降级,异常4)。
export function visibleChannels(): ShareChannelDef[] {
  const list = useConfig().config.share.channels.filter((c) => c.enabled);
  // #ifdef H5
  return list.filter(
    (c) => c.intentType !== "system" || (typeof navigator !== "undefined" && typeof navigator.share === "function"),
  );
  // #endif
  // #ifndef H5
  // ponytail: App 壳 v1 按配置默认序展示;已装检测(plus.runtime)接入时在此过滤。
  // system 项暂隐藏:activateChannel 的 system 分支仅 H5 实现,App 端展示即死按钮
  // (审计 P1);接 uni.share/plus 原生分享时一并放开。
  return list.filter((c) => c.intentType !== "system");
  // #endif
}

export function copyText(data: string): Promise<boolean> {
  return new Promise((resolve) => {
    uni.setClipboardData({ data, showToast: false, success: () => resolve(true), fail: () => resolve(false) });
  });
}

// 渠道激活(渠道面板 + 海报面板共用,单一实现):按 intentType 分派 —
// web 直开 intent(拦截失败降级复制,异常3);scheme 复制引导(异常4);
// copy 复制链接(失败禁误报,FEAT-SHARE1 异常3);system 走 navigator.share。
// poster 型由组件层自行处理(切面板),这里 no-op。
export async function activateChannel(def: ShareChannelDef, surface: ShareSurface, label: string): Promise<void> {
  const t = useT();
  const link = buildShareLink();
  if (!link) {
    toast.info(t.value.share.noCodeYet);
    return;
  }
  const text = remoteApiEnabled
    ? (def.textTemplate?.replace("{link}", link) ?? "")
    : buildShareText();
  switch (def.intentType) {
    case "web": {
      const url = channelIntentUrl(def, link, text);
      if (!url) return;
      let opened = false;
      // #ifdef H5
      if (url.startsWith("sms:")) {
        location.href = url;
        opened = true;
      } else {
        opened = !!window.open(url, "_blank");
      }
      // #endif
      // #ifndef H5
      const plusRuntime = (globalThis as { plus?: { runtime: { openURL: (u: string) => void } } }).plus?.runtime;
      if (plusRuntime) {
        plusRuntime.openURL(url);
        opened = true;
      }
      // #endif
      if (opened) {
        recordShareEvent(def.key, surface);
      } else {
        // 异常3:intent 被拦 → 复制降级;复制也失败则禁误报、不计事件(防白耗一次性任务奖励)。
        const ok = await copyText(text);
        if (ok) {
          toast.info(fmt(t.value.share.openFailedCopied, { channel: label }));
          recordShareEvent(def.key, surface);
        } else {
          toast.info(t.value.share.copyFailed);
        }
      }
      break;
    }
    case "scheme": {
      // 异常4:复制成功才算一次分享;失败禁误报(FEAT-SHARE1 异常3)。
      const ok = await copyText(text);
      if (ok) {
        toast.info(fmt(t.value.share.schemeCopied, { channel: label }));
        recordShareEvent(def.key, surface);
      } else {
        toast.info(t.value.share.copyFailed);
      }
      break;
    }
    case "copy": {
      const ok = await copyText(link);
      if (ok) {
        toast.success(t.value.team.inviteLinkCopied);
        recordShareEvent(def.key, surface);
      } else {
        toast.info(t.value.share.copyFailed);
      }
      break;
    }
    case "system": {
      // #ifdef H5
      try {
        await navigator.share({ title: "NexGrid", text, url: link });
        recordShareEvent(def.key, surface);
      } catch {
        // 取消与真实失败在此均静默不计事件:取消不该报错;AbortError 与其它
        // 异常无法可靠区分,宁可少计不误报(诊断依赖后端 share.performed 对账)。
      }
      // #endif
      break;
    }
    case "poster":
      break;
  }
}

function readEvents(): ShareEventRecord[] {
  try {
    const s = uni.getStorageSync(EVENTS_KEY);
    if (Array.isArray(s)) return s as ShareEventRecord[];
  } catch {
    // first run
  }
  return [];
}

// 分享事件:client 追加记录(PROD: POST /api/share/event),并幂等触发首日任务
// invite_friend——quest store 只记完成,入账 + 账单 + toast 在这里组合
// (对齐 quest.ts 头注的调用层组合约定)。
export function recordShareEvent(channel: string, surface: ShareSurface) {
  if (remoteApiEnabled) {
    // A client-side share intent is not proof of a server mission completion.
    // Do not write a local event row that a different session could mistake for
    // a canonical H8 fact.
    void useQuest().refreshRemote();
    return;
  }
  try {
    const next = [...readEvents(), { channel, surface, sharedAt: Date.now() }].slice(-EVENTS_CAP);
    uni.setStorageSync(EVENTS_KEY, next);
  } catch {
    // storage unavailable — 事件缺失不阻断分享
  }
  // 🔴 与领奖族同一套顺序:先发钱(幂等)→ 后消费资格(2026-08-04 独立验收指出 quest 族
  // 三处漏改)。原来是先 markComplete 消费掉,发钱失败就 return —— 任务标记已置、奖归零,
  // 而 quest 是一次性的,再也拿不到。奖励从静态表就能查到,顺序反得过来。
  const quest = useQuest();
  if (quest.isComplete("invite_friend")) return;
  const task = quest.QUEST_TASKS.find((tk) => tk.id === "invite_friend");
  if (!task) return;
  const t = useT();
  const ref = `QST-invite_friend`; // 稳定 ref:任务一次性,带时间戳会让判重永不命中
  // 同一次任务完成的两腿一次落盘 —— 入账由收据的 amount/symbol 派生,不再单独 credit*。
  const drafts: ReceiptDraft[] = [];
  if (task.usdtReward) drafts.push({ type: "bonus", symbol: "USDT", amount: task.usdtReward, status: "posted", memo: t.value.share.questRewardMemo, ref });
  if (task.nexReward) drafts.push({ type: "bonus", symbol: "NEX", amount: task.nexReward, status: "posted", memo: t.value.share.questRewardMemo, ref });
  if (drafts.length && postMoneyBillsOnce(drafts) !== "ok") return;
  if (!useQuest().markComplete("invite_friend").firstTime) return; // 消费失败:重试命中同 ref 不再发
  toast.success(`+${task.nexReward} NEX · +$${task.usdtReward ?? 0}`, t.value.share.questRewardToast);
}
