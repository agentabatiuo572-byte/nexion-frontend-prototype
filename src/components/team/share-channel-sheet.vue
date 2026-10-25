<template>
  <view v-if="open" class="ss-root" role="dialog" aria-modal="true" :aria-label="copy.inviteFriends">
    <view class="ss-mask" @click="emit('close')" />
    <view class="nx-glass-sheet ss-sheet">
      <view class="ss-grab" />
      <view class="ss-head"><text class="ss-head__t">{{ copy.inviteFriends }}</text><view class="ss-head__x" role="button" tabindex="0" :aria-label="t.ui.close" @click="emit('close')" @keydown.enter.prevent="emit('close')" @keydown.space.prevent="emit('close')"><LiquidGlass :radius="22" tone="control" /><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></view></view>
      <view class="ss-body">
        <view class="ss-reward"><TeamArt kind="invite" :size="100" /><text class="ss-reward__t" :class="{ 'ss-reward__t--amount': rewardHint }">{{ rewardLineText }}</text><text v-if="rewardHint" class="ss-reward__hint">{{ rewardHint }}</text></view>
        <view v-if="statusMessage" class="ss-status" role="status" aria-live="polite" :aria-busy="loading"><text class="ss-status__text">{{ statusMessage }}</text><view v-if="!loading || retrying" class="ss-retry" role="button" :tabindex="loading ? -1 : 0" :aria-disabled="loading" :aria-busy="retrying" @click="retry" @keydown.enter.prevent="retry" @keydown.space.prevent="retry"><LiquidGlass :radius="999" tone="control" /><text>{{ t.share.retry }}</text></view></view>
        <view class="ss-actions">
          <template v-for="(c,index) in displayChannels" :key="c.key">
            <view v-if="index === 1" class="ss-code__copy ss-row" role="button" :aria-label="t.share.copyCode" :tabindex="codeDisabled ? -1 : 0" :aria-disabled="codeDisabled" :aria-busy="channelBusy" @click="onCopyCode" @keydown.enter.prevent="onCopyCode" @keydown.space.prevent="onCopyCode"><svg class="ss-row__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 3H5v18h14V7l-4-4H9Z"/><path d="M14 3v5h5M8 12h8M8 16h5" /></svg><text class="ss-row__label">{{ t.share.copyCode }}</text><text class="ss-code__value">{{ referralCode || '—' }}</text><svg class="ss-row__arrow" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 4H4v12" /></svg></view>
            <view class="ss-ch ss-row" role="button" :aria-label="channelMeta(c.key).label" :tabindex="channelDisabled(c) ? -1 : 0" :aria-busy="channelBusy" :aria-disabled="channelDisabled(c)" @click="onChannel(c)" @keydown.enter.prevent="onChannel(c)" @keydown.space.prevent="onChannel(c)"><view class="ss-row__icon" aria-hidden="true" v-html="channelMeta(c.key).svg" /><text class="ss-row__label">{{ channelMeta(c.key).label }}</text><svg class="ss-row__arrow" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></view>
          </template>
          <view class="ss-rules-toggle ss-row" role="button" tabindex="0" :aria-label="copy.inviteRules" :aria-expanded="rulesOpen" aria-controls="share-invite-rules" @click="rulesOpen=!rulesOpen" @keydown.enter.prevent="rulesOpen=!rulesOpen" @keydown.space.prevent="rulesOpen=!rulesOpen"><svg class="ss-row__icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 3h10l4 4v14H5ZM9 11h6M9 15h6" /></svg><text class="ss-row__label">{{ copy.inviteRules }}</text><text class="ss-row__arrow" aria-hidden="true">{{ rulesOpen ? '−' : '+' }}</text></view>
          <view v-if="rulesOpen" id="share-invite-rules" class="ss-rules" role="region" :aria-label="copy.inviteRules"><text>{{ copy.inviteRuleSummary }}</text><text>{{ copy.inviteRuleSettlement }}</text></view>
        </view>
        <view class="ss-cancel" role="button" tabindex="0" @click="emit('close')" @keydown.enter.prevent="emit('close')" @keydown.space.prevent="emit('close')"><text>{{ t.share.cancel }}</text></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import TeamArt from './team-art.vue';
import LiquidGlass from '@/components/liquid-glass.vue';
import { useApp } from '@/store/app';
import { useLocaleStore } from '@/store/locale';
import { teamRedesignCopy } from '@/i18n/team-redesign';
import { formatAmount } from "@/lib/amount-display";
import { computed, onUnmounted, ref, watch } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { useProductPhase } from "@/composables/use-product-phase";
import { activateChannel, buildShareLink, copyText, currentShareReferralCode, INVITER_REWARD_USDT_ESTIMATE, visibleChannels } from "@/lib/share";
import type { ShareChannelDef, ShareChannelKey } from "@/store/config-types";
import { remoteApiEnabled } from "@/api/runtime";
import { useReferralReward } from "@/store/referral-reward";
import { useConfig } from "@/store/config";
import { toast } from "@/store/ui";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (e: "close"): void; (e: "openPoster"): void }>();

const t = useT();
const app = useApp();
const locale = useLocaleStore();
const copy = computed(() => teamRedesignCopy(locale.code));
const rulesOpen = ref(false);
const channelBusy = ref(false);
const retrying = ref(false);
let actionEpoch = 0;
let actionsOpen = props.open;
function invalidateActions() { actionsOpen = false; actionEpoch++; channelBusy.value = false; retrying.value = false; rulesOpen.value = false; }
watch(() => [app.accountKey, app.accountBindingEpoch] as const, () => {
  invalidateActions();
  if (props.open) emit('close');
}, { flush: 'sync' });
onUnmounted(invalidateActions);
const phase = useProductPhase();
const rewards = useReferralReward();
const cfg = useConfig();

// §8.1.1 口径:估值 × 阶段倍率(与邀请卡同一单源常量,F4)。
const dollarReward = computed(() => Math.round(INVITER_REWARD_USDT_ESTIMATE * phase.value.inviteBonusMultiplier));
const rewardLineText = computed(() => {
  if (remoteApiEnabled) {
    if (rewards.loading || rewards.error) return t.value.team.settlementUnavailable;
    if (rewards.snapshot?.rewardEnabled === false) return t.value.team.referralRewardsDisabled;
    const nex = rewards.snapshot?.inviterRewardNex;
    return nex === undefined
      ? t.value.team.settlementUnavailable
      : `${formatAmount(nex)} UVT`;
  }
  if (!cfg.config.rewards.enabled) return t.value.team.referralRewardsDisabled;
  const base = fmt(t.value.share.rewardLine, { usd: formatAmount(dollarReward.value) });
  const m = phase.value.inviteBonusMultiplier;
  if (m <= 1) return base;
  const promo = fmt(t.value.team.invitePromoChip, { multiplier: m.toFixed(m === Math.floor(m) ? 0 : 1) });
  return `${base} · ${promo}`;
});

const rewardHint = computed(() => remoteApiEnabled && !rewards.loading && !rewards.error && rewards.snapshot?.rewardEnabled
  ? copy.value.qualifiedFriendReward : '');
const channels = computed<ShareChannelDef[]>(() => visibleChannels());
// Built-in actions operate on confirmed invitation data. They are not an
// invented platform response; only optional outbound channels use that list.
const localActions: ShareChannelDef[] = [
  { key: "poster", intentType: "poster", enabled: true },
  { key: "copy", intentType: "copy", enabled: true },
];
const externalChannels = computed(() => channels.value.filter(c =>
  c.key !== "copy" && c.key !== "poster" && c.intentType !== "copy" && c.intentType !== "poster",
));
const displayChannels = computed(() => [...localActions, ...externalChannels.value]);
const referralCode = computed(() => currentShareReferralCode());
const shareLink = computed(() => buildShareLink());
const loading = computed(() => retrying.value || cfg.loading || cfg.configStatus === "idle" || cfg.configStatus === "loading" || (remoteApiEnabled && rewards.loading));
const statusMessage = computed(() => {
  if (loading.value) return t.value.share.channelsLoading;
  if (cfg.configStatus === "failed") return t.value.share.channelsLoadFailed;
  if (!shareLink.value) return t.value.share.linkUnavailable;
  if (remoteApiEnabled && rewards.error) return t.value.team.settlementUnavailable;
  if (!externalChannels.value.length) return t.value.share.channelsEmpty;
  return "";
});
const codeDisabled = computed(() => channelBusy.value || !referralCode.value);
function channelDisabled(c: ShareChannelDef): boolean {
  const local = c.intentType === "copy" || c.intentType === "poster";
  return channelBusy.value || !shareLink.value || (!local && loading.value);
}

// Join startup requests; an explicit retry must reload even a valid empty list.
watch(() => props.open, (open) => {
  if (!open) { invalidateActions(); return; }
  actionsOpen = true;
  void cfg.ensureLoaded();
  if (remoteApiEnabled && !rewards.snapshot?.referralCode && !rewards.loading) void rewards.refresh();
}, { immediate: true });

async function retry() {
  if (loading.value) return;
  const operation = actionEpoch;
  retrying.value = true;
  try {
    await Promise.all([
      cfg.load(),
      remoteApiEnabled && (!rewards.snapshot?.referralCode || !!rewards.error) ? rewards.refresh() : Promise.resolve(),
    ]);
  } finally {
    if (operation === actionEpoch) retrying.value = false;
  }
}

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


async function onCopyCode() {
  if (!actionsOpen || !props.open || codeDisabled.value) return;
  const operation = actionEpoch, code = referralCode.value;
  channelBusy.value = true;
  try {
    const copied = await copyText(code);
    if (operation !== actionEpoch || !props.open || code !== referralCode.value) return;
    if (copied) toast.success(t.value.team.inviteCodeCopied);
    else toast.info(t.value.share.copyFailed);
  } finally {
    if (operation === actionEpoch) channelBusy.value = false;
  }
}
async function onChannel(c: ShareChannelDef) {
  if (!actionsOpen || !props.open || channelDisabled(c)) return;
  const operation = actionEpoch;
  if (c.intentType === "poster") {
    emit("openPoster");
    return;
  }
  channelBusy.value = true;
  try {
    if (c.intentType === "copy") {
      const link = shareLink.value;
      const copied = await copyText(link);
      if (operation !== actionEpoch || !props.open || link !== shareLink.value) return;
      if (copied) toast.success(t.value.team.inviteLinkCopied);
      else toast.info(t.value.share.copyFailed);
    } else await activateChannel(c, "share_sheet", channelMeta(c.key).label);
  } catch {
    if (operation === actionEpoch && props.open) toast.info(t.value.share.actionFailed);
  } finally {
    if (operation === actionEpoch) channelBusy.value = false;
  }
}

useDialogA11y(computed(() => props.open), ".ss-root", () => emit("close"));


</script>

<style scoped>
.ss-mask { position:fixed;inset:0;background:var(--v5-bg-color-mask);backdrop-filter:blur(3px);z-index:8000; }
.ss-sheet { position:fixed;left:0;right:0;bottom:0;z-index:8001;display:flex;flex-direction:column;max-height:86vh;overflow:hidden;border-radius:24px 24px 0 0;background:var(--nx-glass-fill);box-shadow:var(--nx-glass-edge);padding-bottom:env(safe-area-inset-bottom,0px);animation:ss-up .25s ease; }
.ss-grab { flex:none;width:36px;height:4px;border-radius:9px;background:var(--v5-surface-3);margin:var(--ui-space-row-y) auto 0; }.ss-head { flex:none;display:flex;align-items:center;justify-content:space-between;gap:var(--ui-space-inline);padding:var(--ui-space-row-y) 20px; }.ss-head__t { font:600 20px/1.4 var(--font-v5);color:var(--v5-ink);overflow-wrap:anywhere; }
.ss-head__x { position:relative;isolation:isolate;flex:none;width:44px;height:44px;display:grid;place-items:center;border-radius:50%;color:var(--v5-ink);cursor:pointer; }.ss-head__x svg { position:relative; }
.ss-body { min-height:0;overflow-y:auto;overscroll-behavior-y:contain;padding:0 20px 12px; }.ss-reward { display:flex;flex-direction:column;align-items:center;text-align:center;gap:8px;padding:4px 0 24px; }.ss-reward__t { font:400 13px/1.6 var(--font-v5);color:var(--v5-ink-2);overflow-wrap:anywhere; }.ss-reward__t--amount { font:600 30px/1.25 var(--font-v5);color:var(--v5-ink); }.ss-reward__hint { font:400 12px/1.5 var(--font-v5);color:var(--v5-ink-3); }
.ss-status { display:flex;align-items:center;gap:var(--ui-space-inline);margin-bottom:var(--ui-space-inset); }.ss-status__text { flex:1;min-width:0;font:400 12px/1.6 var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }.ss-retry { position:relative;isolation:isolate;flex:none;min-height:44px;padding:0 16px;display:flex;align-items:center;border-radius:999px;color:var(--v5-ink);font-size:12px; }.ss-retry text { position:relative; }
.ss-row { display:flex;align-items:center;gap:var(--ui-space-inline);min-height:62px;padding:var(--ui-space-row-y) 0;border-bottom:1px solid var(--v5-border);color:var(--v5-ink);cursor:pointer; }.ss-row__icon,.ss-row__arrow { flex:none;display:flex;align-items:center;justify-content:center; }.ss-row__label { flex:1;min-width:0;font:500 14px/1.5 var(--font-v5);overflow-wrap:anywhere; }.ss-code__value { max-width:42%;font:500 12px/1.5 var(--font-v5);color:var(--v5-ink-2);text-align:right;overflow-wrap:anywhere; }
.ss-row[aria-disabled="true"],.ss-retry[aria-disabled="true"] { opacity:.45;cursor:default; }.ss-rules { padding:var(--ui-space-inset) 0;border-bottom:1px solid var(--v5-border); }.ss-rules text { display:block;margin-bottom:6px;font:400 12px/1.7 var(--font-v5);color:var(--v5-ink-3);overflow-wrap:anywhere; }.ss-cancel { display:flex;align-items:center;justify-content:center;min-height:48px;margin-top:6px;font:400 13px/1.5 var(--font-v5);color:var(--v5-ink-3);cursor:pointer; }
.ss-sheet [tabindex="0"]:focus-visible { outline:2px solid var(--v5-brand);outline-offset:2px; }
@keyframes ss-up { from { transform:translateY(100%); } to { transform:translateY(0); } }
@media(prefers-reduced-motion:reduce) { .ss-sheet { animation:none; } }
</style>
