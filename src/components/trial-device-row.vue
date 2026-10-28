<template>
  <view v-if="presentation.active.value" class="trial-device-row" :class="[`trial-device-row--${variant}`, { 'nx-glass-card': variant === 'inventory' }]" data-trial-device-row="true" data-device-key="trial:current">
    <view class="trial-device-row__heading" role="button" tabindex="0" :aria-label="`${copy.details}: ${presentation.deviceName.value || '—'} · ${statusText} · ${presentation.status.value === 'grace' ? copy.creditRemaining : copy.remaining} ${remainingText}`" :aria-expanded="variant === 'home' ? undefined : isExpanded" :aria-controls="variant === 'home' ? undefined : `trial-device-details-${variant}`" @click="onRowClick">
      <view class="trial-device-row__main">
        <view class="trial-device-row__art" aria-hidden="true"><image v-if="productMedia" class="trial-device-row__image" :src="productMedia.src" mode="aspectFit" /><text class="trial-device-row__image-badge">{{ copy.imageBadge }}</text></view>
        <view class="trial-device-row__identity"><text class="trial-device-row__name">{{ presentation.deviceName.value || '—' }}</text><text class="trial-device-row__status" :class="{ 'trial-device-row__status--online': isOnline }">{{ statusText }}</text></view>
      </view>
      <view class="trial-device-row__summary">
        <view class="trial-device-row__time"><text>{{ presentation.status.value === 'grace' ? copy.creditRemaining : copy.remaining }}</text><text class="trial-device-row__remaining">{{ remainingText }}</text></view>
        <view class="trial-device-row__chevron" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: variant !== 'home' && isExpanded ? 'rotate(180deg)' : undefined }"><path :d="variant === 'home' ? 'm9 6 6 6-6 6' : 'm6 9 6 6 6-6'" /></svg></view>
      </view>
    </view>
    <view v-if="variant !== 'home' && isExpanded" :id="`trial-device-details-${variant}`" class="trial-device-row__body">
      <text v-if="presentation.status.value === 'grace'" class="trial-device-row__state">{{ copy.grace }}</text>
      <view class="trial-device-row__credit"><text>{{ copy.availableCredit }}</text><text class="trial-device-row__amount font-mono-tabular">{{ money(presentation.offsetUSD.value) }}</text></view>
      <view v-if="!hidePersonalData" class="trial-device-row__progress" role="progressbar" :aria-label="copy.availableCredit" :aria-valuenow="presentation.offsetProgress.value === null ? undefined : Math.round(presentation.offsetProgress.value * 100)" aria-valuemin="0" aria-valuemax="100"><view :style="{ width: `${(presentation.offsetProgress.value ?? 0) * 100}%` }" /></view>
      <view class="trial-device-row__estimate"><text>{{ copy.estimate }}</text><text class="font-mono-tabular">{{ money(presentation.estimatedOffsetUSD.value) }}</text></view>
      <text class="trial-device-row__note">{{ copy.creditNote }}</text>
      <view v-if="!presentation.presentationReady.value" class="trial-device-row__notice nx-inline-recovery" role="status"><text class="nx-inline-recovery__copy">{{ copy.unknown }}</text><view v-if="!presentation.presentationReady.value" class="trial-device-row__retry nx-inline-recovery__action" role="button" tabindex="0" @click="presentation.refresh"><text>{{ copy.retry }}</text></view></view>
      <view class="trial-device-row__actions">
        <view class="trial-device-row__details" role="button" tabindex="0" :aria-label="copy.details" @click="goDetails"><text>{{ copy.detailsAction }}</text></view>
        <view class="trial-device-row__buy" :style="{ opacity: presentation.presentationReady.value && !presentation.actionsReady.value ? 1 : undefined }" role="button" :tabindex="presentation.actionsReady.value ? 0 : -1" :aria-disabled="!presentation.actionsReady.value" @click="goBuy"><text>{{ presentation.status.value === 'grace' ? copy.buy : copy.buyEarly }}</text><text aria-hidden="true">→</text></view>
      </view>
      <view v-if="showCancel && presentation.status.value === 'active'" class="trial-device-row__cancel" :style="{ opacity: presentation.presentationReady.value && !presentation.actionsReady.value && !cancelBusy ? 1 : undefined }" role="button" :tabindex="presentation.actionsReady.value && !cancelBusy ? 0 : -1" :aria-disabled="!presentation.actionsReady.value || cancelBusy" @click="requestCancel"><text>{{ cancelBusy ? copy.cancelBusy : copy.cancel }}</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { useDataVisibility } from "@/store/data-visibility";
import { computed, ref } from "vue";
import { useTrialPresentation } from "@/composables/use-trial-presentation";
import { useTrialFleetCopy } from "@/i18n/trial-fleet";
import { useT } from "@/i18n/use-t";
import { formatTrialRemaining } from "@/i18n/trial-lifecycle";
import { formatAmount } from "@/lib/amount-display";
import { navTo } from "@/lib/route";
import { getProductMedia } from "@/lib/product-media";

const props = withDefaults(defineProps<{ variant?: "home" | "earn" | "inventory"; expanded?: boolean; showCancel?: boolean; cancelBusy?: boolean }>(), { variant: "earn", expanded: undefined });
const visibility = useDataVisibility();
const hidePersonalData = computed(() => props.variant !== "inventory" && visibility.hidden);
const emit = defineEmits<{ (event: "cancel"): void; (event: "toggle"): void }>();
const presentation = useTrialPresentation();
const copy = useTrialFleetCopy();
const t = useT();
const localExpanded = ref(false);
const isExpanded = computed(() => props.expanded ?? localExpanded.value);
const productMedia = computed(() => getProductMedia(presentation.productId.value));
const isOnline = computed(() => presentation.presentationReady.value && presentation.status.value === "active");
const statusText = computed(() => !presentation.presentationReady.value ? copy.value.statusUnknown
  : isOnline.value ? t.value.earn.online : t.value.earn.offline);
const remainingText = computed(() => presentation.remainingMs.value === null ? "—" : formatTrialRemaining(presentation.remainingMs.value, copy.value.longRemaining));
function money(value: number | null) {
  const formatted = value === null ? "—" : `$${formatAmount(value)}`;
  return props.variant === "inventory" ? formatted : visibility.mask(formatted);
}
function goDetails() { navTo("/pages/me/trial"); }
function onRowClick() {
  if (props.variant === "home") { goDetails(); return; }
  if (props.expanded === undefined) localExpanded.value = !localExpanded.value;
  emit("toggle");
}
function goBuy() { if (presentation.actionsReady.value) goDetails(); }
function requestCancel() { if (presentation.actionsReady.value && !props.cancelBusy) emit("cancel"); }
</script>

<style scoped>
.trial-device-row { color:var(--v5-ink); min-width:0; overflow:hidden; }
.trial-device-row__heading { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:8px; min-height:88px; padding:14px; }
.trial-device-row__heading:active { opacity:.7; }
.trial-device-row__main { display:flex; align-items:center; gap:10px; min-width:0; }
.trial-device-row__art { position:relative; display:grid; place-items:center; flex:none; width:52px; height:56px; overflow:hidden; }
.trial-device-row__image { display:block; width:52px; height:52px; }
.trial-device-row__image-badge { position:absolute; right:2px; top:2px; padding:1px 2px; border-radius:4px; background:var(--v5-brand); color:var(--v5-on-brand); font:500 9px/11px var(--font-v5); white-space:nowrap; }
.trial-device-row__identity { min-width:0; flex:1; }
.trial-device-row__name { display:block; font:600 clamp(13px,3.85vw,15px)/1.4 var(--font-v5); overflow-wrap:anywhere; }
.trial-device-row__status { display:block; margin-top:4px; color:var(--v5-ink-3); font:400 clamp(11px,3.08vw,12px)/18px var(--font-v5); }
.trial-device-row__status--online::before { content:""; display:inline-block; width:7px; height:7px; margin-right:6px; border-radius:50%; background:var(--v5-success); vertical-align:1px; }
.trial-device-row__summary { display:flex; align-items:center; gap:8px; min-width:0; max-width:152px; }
.trial-device-row__time { min-width:0; text-align:right; color:var(--v5-ink-3); font:400 clamp(11px,3.08vw,12px)/1.4 var(--font-v5); }
.trial-device-row__time > text { display:block; overflow-wrap:anywhere; }
.trial-device-row__remaining { margin-top:4px; color:var(--v5-ink); font:600 clamp(12px,3.6vw,14px)/1.35 var(--font-v5); font-variant-numeric:tabular-nums; }
.trial-device-row__chevron { display:grid; place-items:center; flex:none; width:28px; height:28px; border-radius:var(--v5-radius-full); background:var(--v5-surface-2); color:var(--v5-ink-3); }
.trial-device-row__chevron svg { transition:transform .25s ease; }
.trial-device-row__body { padding:0 20px 16px; }
.trial-device-row__state { display:block; margin-top:3px; color:var(--v5-ink-3); font:400 12px/18px var(--font-v5); overflow-wrap:anywhere; }
.trial-device-row__credit,.trial-device-row__estimate { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:5px 12px; margin-top:12px; font:400 12px/18px var(--font-v5); color:var(--v5-ink-3); }
.trial-device-row__amount { color:var(--v5-brand); font-size:20px; line-height:26px; font-weight:600; }
.trial-device-row__progress { height:5px; margin-top:8px; overflow:hidden; border-radius:var(--v5-radius-full); background:var(--v5-surface-3); }
.trial-device-row__progress > view { height:100%; border-radius:inherit; background:var(--v5-brand); }
.trial-device-row__estimate { margin-top:6px; }
.trial-device-row__note { display:block; margin-top:8px; font:400 11px/17px var(--font-v5); color:var(--v5-ink-3); }
.trial-device-row__notice { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:6px; margin-top:8px; color:var(--v5-warning-ink); font:400 12px/18px var(--font-v5); }
.trial-device-row__notice.nx-inline-recovery { display:grid; gap:12px; }
.trial-device-row__retry { display:flex; align-items:center; min-height:44px; padding:0 8px; color:var(--v5-brand); }
.trial-device-row__actions { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:4px 8px; margin-top:8px; }
/* Keep the mobile hit area while the visible pill remains a compact 32px. */
.trial-device-row__actions > view { position:relative; display:inline-flex; flex:0 1 auto; align-items:center; justify-content:center; min-height:44px; max-width:100%; box-sizing:border-box; padding:8px 12px; border-radius:var(--v5-radius-full); font:500 clamp(12px,3.34vw,13px)/18px var(--font-v5); text-align:center; }
.trial-device-row__actions > view::before { content:""; position:absolute; inset:6px 0; border-radius:inherit; pointer-events:none; }
.trial-device-row__actions > view > text { position:relative; }
.trial-device-row__details { color:var(--v5-ink-2); }
.trial-device-row__details::before { border:1px solid var(--v5-border); }
.trial-device-row__buy { gap:6px; margin-left:auto; color:var(--v5-brand); }
.trial-device-row__buy::before { background:var(--v5-brand-soft); }
.trial-device-row__buy[aria-disabled="true"],.trial-device-row__cancel[aria-disabled="true"] { opacity:.5; }
.trial-device-row__cancel { display:flex; align-items:center; justify-content:center; min-height:44px; margin-top:8px; border-top:1px solid var(--v5-border); color:var(--v5-ink-3); font:400 12px/18px var(--font-v5); }
.trial-device-row--home .trial-device-row__heading { min-height:64px; padding:10px 16px; gap:12px; }
.trial-device-row--home .trial-device-row__main { gap:12px; }
.trial-device-row--home .trial-device-row__art { width:48px; height:48px; border-radius:14px; overflow:visible; background:radial-gradient(80% 70% at 50% 70%,color-mix(in srgb,var(--v5-ink) 6%,transparent),transparent); }
.trial-device-row--home .trial-device-row__name { font-weight:500; line-height:20px; }
.trial-device-row--home .trial-device-row__status { margin-top:2px; }
.trial-device-row--home .trial-device-row__summary { gap:12px; }
.trial-device-row--home .trial-device-row__chevron { width:16px; background:none; color:var(--v5-ink-4); }
.trial-device-row--inventory .trial-device-row__heading { min-height:64px; padding:12px 16px; }
.trial-device-row--inventory .trial-device-row__main { gap:12px; }
.trial-device-row--inventory .trial-device-row__art { width:64px; height:64px; border-radius:8px; }
.trial-device-row--inventory .trial-device-row__image { width:64px; height:64px; }
.trial-device-row--inventory .trial-device-row__image-badge { right:1px; padding:1px; font-size:8.5px; }
.trial-device-row--inventory .trial-device-row__name { font-size:clamp(12px,3.34vw,13px); }
.trial-device-row--inventory .trial-device-row__remaining { font-family:var(--font-v5); font-size:13px; font-variant-numeric:tabular-nums; }
.trial-device-row--inventory .trial-device-row__body { padding:0 16px 12px; }
[role="button"] { cursor:pointer; }
[role="button"]:focus-visible { outline:2px solid var(--v5-brand); outline-offset:2px; }
.trial-device-row__heading:focus-visible { outline-offset:-2px; }
@media (max-width:374px) {
  .trial-device-row--inventory .trial-device-row__art,.trial-device-row--inventory .trial-device-row__image { width:56px; height:56px; }
}
@media (max-width:350px) {
  .trial-device-row--earn .trial-device-row__heading { padding:12px; gap:6px; }
  .trial-device-row--earn .trial-device-row__main { gap:6px; }
  .trial-device-row--earn .trial-device-row__art,.trial-device-row--earn .trial-device-row__image { width:44px; }
  .trial-device-row__summary { gap:4px; max-width:112px; }
  .trial-device-row--home .trial-device-row__summary { gap:4px; max-width:92px; }
  .trial-device-row--home .trial-device-row__time { font-size:11px; line-height:1.2; }
  .trial-device-row--home .trial-device-row__remaining { font-size:12px; line-height:1.2; }
  .trial-device-row--home .trial-device-row__name { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .trial-device-row--home .trial-device-row__status { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .trial-device-row--inventory .trial-device-row__time { font-size:11px; line-height:1.2; }
  .trial-device-row--inventory .trial-device-row__remaining { font-size:12px; line-height:1.2; }
}
@media (prefers-reduced-motion:reduce) { .trial-device-row__chevron svg { transition:none; } }
</style>
