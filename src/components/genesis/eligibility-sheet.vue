<!-- 创世认购资格：只展示服务端新策略，不在客户端拼装资格条件。 -->
<template>
  <view v-if="open">
    <transition name="nx-elig-fade">
      <view v-if="open" class="nx-elig-backdrop" role="dialog" aria-modal="true" @click="emitClose" />
    </transition>
    <transition name="nx-elig-slide">
      <view v-if="open" class="nx-elig-panel" :style="panelStyle" @click.stop>
        <view class="flex items-start justify-between" style="margin-bottom: 14px">
          <view>
            <text class="block" :style="titleStyle">{{ t.genesisEligibility.title }}</text>
            <text class="block" :style="subtitleStyle">{{ t.genesisEligibility.subtitlePolicy }}</text>
          </view>
          <view class="inline-flex items-center justify-center active:opacity-60" :style="closeBtnStyle" @click="emitClose">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </view>
        </view>

        <view v-if="gate.eligible" :style="unlockedBannerStyle">
          <view class="flex items-center" style="gap: 8px">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-success-ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            <view class="flex-1 min-w-0">
              <text class="block" :style="unlockedTitleStyle">{{ t.genesisEligibility.unlockedTitle }}</text>
              <text class="block" :style="unlockedSubStyle">{{ t.genesisEligibility.unlockedSub }}</text>
            </view>
          </view>
        </view>

        <view :style="ruleListStyle">
          <view :style="ruleRowStyle">
            <text :style="ruleLabelStyle">{{ t.genesisEligibility.accountAgeRule }}</text>
            <text :style="ruleValueStyle">{{ accountAgeDays }} / {{ minAccountAgeDays }} {{ t.genesisEligibility.daysUnit }}</text>
          </view>
          <view :style="ruleRowStyle">
            <text :style="ruleLabelStyle">{{ t.genesisEligibility.holdingCapRule }}</text>
            <text :style="ruleValueStyle">{{ ownedCount }} / {{ maxPerUser }}</text>
          </view>
          <view v-for="reason in visibleReasons" :key="reason" :style="reasonRowStyle">
            <text :style="reasonTextStyle">{{ reasonText(reason) }}</text>
          </view>
        </view>

        <text v-if="gate.capReached" class="block" :style="capNoteStyle">{{ capNoteText }}</text>
        <view
          v-if="gate.eligible && !gate.capReached"
          class="w-full inline-flex items-center justify-center active:opacity-85"
          :style="subscribeStyle"
          @click="emitSubscribe"
        >
          <text>{{ t.genesisEligibility.unlockedCta }}</text>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </view>
      </view>
    </transition>
  </view>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { GENESIS_ELIGIBILITY_POLICY, useGenesis } from "@/store/genesis";
import { useGenesisEligibility } from "@/composables/use-genesis-eligibility";
import { remoteApiEnabled } from "@/api/runtime";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ "update:open": [boolean]; subscribe: [] }>();
const t = useT();
const genesis = useGenesis();
const { gate } = useGenesisEligibility();

const minAccountAgeDays = computed(() => remoteApiEnabled
  ? genesis.remoteEligibility?.minAccountAgeDays ?? 0
  : GENESIS_ELIGIBILITY_POLICY.minAccountAgeDays);
const accountAgeDays = computed(() => remoteApiEnabled
  ? genesis.remoteEligibility?.accountAgeDays ?? 0
  : 0);
const maxPerUser = computed(() => remoteApiEnabled
  ? genesis.remoteEligibility?.maxPerUser ?? 0
  : GENESIS_ELIGIBILITY_POLICY.maxPerUser);
const ownedCount = computed(() => remoteApiEnabled
  ? genesis.remoteEligibility?.ownedCount ?? genesis.myOwned
  : genesis.myOwned);
const visibleReasons = computed(() => [...new Set(gate.value.reasons)]);
const capNoteText = computed(() => fmt(t.value.genesisEligibility.capReachedNote, { n: maxPerUser.value }));

function reasonText(reason: string): string {
  const copy = t.value.genesisEligibility;
  const byCode: Record<string, string> = {
    SALE_POLICY_UNAVAILABLE: copy.reasonPolicyUnavailable,
    ACCOUNT_AGE_REQUIRED: copy.reasonAccountAge,
    COUNTRY_REQUIRED: copy.reasonCountry,
    GEO_BLOCKED: copy.reasonGeoBlocked,
    PRESALE_NOT_OPEN: copy.reasonPresaleClosed,
    USER_CAP_REACHED: copy.reasonCapReached,
    MARKET_DISABLED: copy.reasonMarketDisabled,
  };
  return byCode[reason] ?? copy.reasonUnavailable;
}

function emitClose() { emit("update:open", false); }
function emitSubscribe() { emit("subscribe"); }

const panelStyle: CSSProperties = { background: "var(--v5-surface)", borderTop: "1px solid var(--v5-border)", padding: "18px 16px calc(env(safe-area-inset-bottom) + 38px)" };
const titleStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "20px", fontWeight: 600, letterSpacing: "-0.018em", color: "var(--v5-ink)", lineHeight: 1.2 };
const subtitleStyle: CSSProperties = { marginTop: "4px", fontFamily: "var(--font-v5)", fontSize: "13px", color: "var(--v5-ink-3)" };
const closeBtnStyle: CSSProperties = { width: "40px", height: "40px", borderRadius: "999px", color: "var(--v5-ink-3)" };
const unlockedBannerStyle: CSSProperties = { background: "color-mix(in srgb, var(--v5-success) 12%, transparent)", borderRadius: "14px", padding: "12px 14px", marginBottom: "12px" };
const unlockedTitleStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)", lineHeight: 1.25 };
const unlockedSubStyle: CSSProperties = { marginTop: "2px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.4 };
const ruleListStyle: CSSProperties = { display: "flex", flexDirection: "column", gap: "10px" };
const ruleRowStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", background: "var(--v5-surface-2)", borderRadius: "14px", padding: "13px 14px" };
const ruleLabelStyle: CSSProperties = { fontFamily: "var(--font-v5)", fontSize: "13px", fontWeight: 500, color: "var(--v5-ink)" };
const ruleValueStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-3)", whiteSpace: "nowrap" };
const reasonRowStyle: CSSProperties = { background: "color-mix(in srgb, var(--v5-warning) 10%, var(--v5-surface-2))", borderRadius: "14px", padding: "12px 14px" };
const reasonTextStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-2)", lineHeight: 1.45 };
const capNoteStyle: CSSProperties = { marginTop: "12px", fontSize: "12px", color: "var(--v5-ink-3)", textAlign: "center", lineHeight: 1.45 };
const subscribeStyle: CSSProperties = { marginTop: "14px", height: "50px", padding: "0 28px", borderRadius: "999px", gap: "6px", background: "var(--v5-brand)", boxShadow: "var(--v5-spotlight-brand)", color: "var(--v5-on-brand)", fontFamily: "var(--font-v5)", fontWeight: 500, fontSize: "15px" };

useDialogA11y(computed(() => props.open), ".nx-elig-backdrop", emitClose);
</script>

<style scoped>
.nx-elig-backdrop { position: fixed; inset: 0; z-index: 790; background: var(--v5-bg-color-mask); backdrop-filter: blur(8px); }
.nx-elig-panel { position: fixed; left: 0; right: 0; bottom: 0; z-index: 800; border-top-left-radius: 16px; border-top-right-radius: 16px; }
.nx-elig-fade-enter-active, .nx-elig-fade-leave-active { transition: opacity 0.24s cubic-bezier(0.32, 0.72, 0, 1); }
.nx-elig-fade-enter-from, .nx-elig-fade-leave-to { opacity: 0; }
.nx-elig-slide-enter-active { transition: transform 0.32s cubic-bezier(0.16, 1, 0.3, 1); }
.nx-elig-slide-leave-active { transition: transform 0.24s cubic-bezier(0.32, 0.72, 0, 1); }
.nx-elig-slide-enter-from, .nx-elig-slide-leave-to { transform: translateY(100%); }
</style>
