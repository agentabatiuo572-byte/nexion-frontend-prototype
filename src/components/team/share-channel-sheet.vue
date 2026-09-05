<!--
  [FEAT-SHARE3] 立即分享渠道面板 — 底部弹层:邀请人奖励说明行 + 渠道 grid + 取消。
  规格: PRD/specs/FEAT-SHARE01-invite-chain.md [FEAT-SHARE3]。
  渠道表来自 platform config(share.channels,顺序即展示序);intent 分派走
  lib/share.activateChannel(web 直开 / scheme 复制降级 / copy / system),poster
  项切到海报面板(emit)。配置为空时兜底「复制+海报」两项,面板永不空(异常1)。
  cancel 为 ghost 弱权重(转化场景 cancel 必弱于渠道,nexgrid-design)。
-->
<template>
  <view v-if="open">
    <view class="ss-mask" @click="emit('close')" />
    <view class="ss-sheet">
      <view class="ss-grab" />
      <view class="ss-head">
        <text class="ss-head__t">{{ t.share.channelTitle }}</text>
        <view class="ss-head__x active:opacity-70" @click="emit('close')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </view>
      </view>
      <view class="ss-reward">
        <text class="ss-reward__t">{{ rewardLineText }}</text>
      </view>
      <view class="ss-grid">
        <view v-for="c in channels" :key="c.key" class="ss-ch active:scale-95" @click="onChannel(c)">
          <view class="ss-ch__ic" :class="{ 'ss-ch__ic--hl': c.intentType === 'copy' || c.intentType === 'poster' }" v-html="channelMeta(c.key).svg" />
          <text class="ss-ch__lb">{{ channelMeta(c.key).label }}</text>
        </view>
      </view>
      <view class="ss-cancel active:opacity-70" @click="emit('close')">
        <text class="ss-cancel__t">{{ t.share.cancel }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useProductPhase } from "@/composables/use-product-phase";
import { activateChannel, INVITER_REWARD_USDT_ESTIMATE, visibleChannels } from "@/lib/share";
import type { ShareChannelDef, ShareChannelKey } from "@/store/config-types";
import { remoteApiEnabled } from "@/api/runtime";
import { useReferralReward } from "@/store/referral-reward";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void; (e: "openPoster"): void }>();

const t = useT();
const phase = useProductPhase();
const rewards = useReferralReward();

// §8.1.1 口径:估值 × 阶段倍率(与邀请卡同一单源常量,F4)。
const dollarReward = computed(() => Math.round(INVITER_REWARD_USDT_ESTIMATE * phase.value.inviteBonusMultiplier));
const rewardLineText = computed(() => {
  if (remoteApiEnabled) {
    const nex = rewards.snapshot?.inviterRewardNex;
    return nex === undefined
      ? "Server invitation reward unavailable"
      : `Server-set reward: ${nex.toLocaleString()} NEX per settled invitation`;
  }
  const base = fmt(t.value.share.rewardLine, { usd: dollarReward.value });
  const m = phase.value.inviteBonusMultiplier;
  if (m <= 1) return base;
  const promo = fmt(t.value.team.invitePromoChip, { multiplier: m.toFixed(m === Math.floor(m) ? 0 : 1) });
  return `${base} · ${promo}`;
});

// 渠道配置空 → 兜底两项,面板永不空(异常1)。
const FALLBACK: ShareChannelDef[] = [
  { key: "copy", intentType: "copy", enabled: true },
  { key: "poster", intentType: "poster", enabled: true },
];
const channels = computed<ShareChannelDef[]>(() => {
  const list = visibleChannels();
  return list.length || remoteApiEnabled ? list : FALLBACK;
});

interface ChannelMeta {
  label: string;
  svg: string;
}
function icon(paths: string): string {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
// 品牌名为专有名词(双语一致);sms/copy/poster/system 走 i18n。
function channelMeta(key: ShareChannelKey): ChannelMeta {
  switch (key) {
    case "zalo":
      return { label: "Zalo", svg: icon('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="M9 10h6l-6 4h6" />') };
    case "telegram":
      return { label: "Telegram", svg: icon('<path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" />') };
    case "whatsapp":
      return { label: "WhatsApp", svg: icon('<path d="M13.8 12.4a.5.5 0 0 0 .5.7 5 5 0 0 0 2.4-1c.3-.2.7-.2 1 0l2 1.6c.3.3.4.8.1 1.1A7 7 0 0 1 9 12.1 7 7 0 0 1 7.2 4.2c.3-.3.8-.2 1.1.1l1.6 2c.2.3.2.7 0 1a5 5 0 0 0-1 2.4.5.5 0 0 0 .7.5" /><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />') };
    case "messenger":
      return { label: "Messenger", svg: icon('<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /><path d="m8 12 3-3 2 2 3-3" />') };
    case "sms":
      return { label: t.value.share.smsLabel, svg: icon('<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z" /><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1" />') };
    case "x":
      return { label: "X", svg: icon('<path d="M4 4l16 16" /><path d="M20 4 4 20" />') };
    case "copy":
      return { label: t.value.share.copyLink, svg: icon('<rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />') };
    case "poster":
      return { label: t.value.share.posterTitle, svg: icon('<rect width="18" height="18" x="3" y="3" rx="2" ry="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />') };
    case "system":
      return { label: t.value.share.more, svg: icon('<circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />') };
  }
}

async function onChannel(c: ShareChannelDef) {
  if (c.intentType === "poster") {
    emit("openPoster");
    return;
  }
  await activateChannel(c, "share_sheet", channelMeta(c.key).label);
}
</script>

<style scoped>
.ss-mask { position: fixed; inset: 0; background: var(--v5-bg-color-mask); backdrop-filter: blur(3px); z-index: 8000; }
.ss-sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 8001; background: var(--v5-surface); border-top: 1px solid var(--v5-border-strong); border-radius: 22px 22px 0 0; max-height: 80vh; overflow-y: auto; padding-bottom: calc(env(safe-area-inset-bottom) + 38px); animation: ss-up 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes ss-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
.ss-grab { width: 40px; height: 4px; border-radius: 9999px; background: var(--v5-surface-3); margin: 10px auto 0; }
.ss-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px 0; }
.ss-head__t { font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-ink); }
/* 44×44 点按区(移动端最小触控标准,对齐 tradein-ladder-sheet 既有修法)。 */
.ss-head__x { width: 44px; height: 44px; border-radius: 9999px; background: var(--v5-surface-2); display: flex; align-items: center; justify-content: center; }
.ss-reward { margin: 10px 16px 0; border-radius: 12px; background: color-mix(in srgb, var(--v5-brand) 8%, transparent); padding: 10px 12px; }
.ss-reward__t { font-size: 12px; color: var(--v5-ink-2); line-height: 1.55; text-wrap: pretty; }
.ss-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px 6px; padding: 14px 16px 4px; }
.ss-ch { display: flex; flex-direction: column; align-items: center; gap: 6px; min-height: 44px; }
.ss-ch__ic { width: 48px; height: 48px; border-radius: 9999px; background: var(--v5-surface-2); color: var(--v5-ink-2); display: flex; align-items: center; justify-content: center; }
.ss-ch__ic--hl { background: color-mix(in srgb, var(--v5-brand) 14%, transparent); color: var(--v5-brand); }
.ss-ch__lb { font-size: 12px; color: var(--v5-ink-3); max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* 转化场景 cancel 必须弱于主操作:ghost、font-normal、ink-3。 */
.ss-cancel { margin: 8px 16px 16px; min-height: 48px; border-radius: 9999px; display: flex; align-items: center; justify-content: center; }
.ss-cancel__t { font-size: 13px; font-weight: 400; color: var(--v5-ink-3); }
</style>
