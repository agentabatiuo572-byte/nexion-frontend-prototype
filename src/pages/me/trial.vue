<!--
  Free-trial dashboard — FEAT-TRIAL02 cardless five-state page (spec ⑤):
    · none      → claim intro (CTA opens the claim sheet; ineligible = disabled
                  CTA + concrete reason, 异常2)
    · active    → countdown hero + accrued credit + "buy now (credit applies)"
                  CTA → checkout (conversion mode derives from store state)
    · grace     → stopped state: dimmed hero + "production stopped" + credit
                  amount + expiry time + buy CTA (异常1 surface)
    · ended     → terminal: credit expired (time + reason) + plain buy CTA
    · converted → terminal: owned — link to device inventory
  A "how the credit works" entry opens the in-page rules sheet (spec ⑥).
  Conversion money/order all live in checkout — this page never debits.
  Wrapped in <AppChassis active="me">.
-->
<template>
  <AppChassis active="me">
    <view style="padding-bottom: 24px">
      <SubPageHeader back="/pages/me/me" :title="t.trial.pageTitle" :subtitle="t.trial.pageHeaderSubtitle" />

      <view class="mx-4" style="display: flex; flex-direction: column; gap: 12px">
        <!-- ═══ active / grace — running cycle ═══ -->
        <template v-if="isActiveCycle">
          <CountdownHero
            :status="status"
            :now="now"
            :remaining-ms="remainingMsValue"
            :shadow-u-s-d="shadowUSD"
            :shadow-n-e-x="shadowNEX"
            :started-at="freeTrial.startedAt"
            :expires-at="freeTrial.expiresAt"
            :grace-ends-at="freeTrial.graceEndsAt"
          />

          <!-- Legacy card-era trial migrated → rules-changed notice (异常6) -->
          <view v-if="freeTrial.legacyCardMigrated" class="flex items-start" :style="legacyNoteStyle">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-top: 1px; flex-shrink: 0"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
            <text style="margin-left: 8px; font-size: 12px; color: var(--v5-ink-3); line-height: 1.625">{{ t.trial.legacyMigratedNote }}</text>
          </view>

          <!-- Grace: stopped note — device dimmed above; here the plain words -->
          <view v-if="status === 'grace'" :style="stoppedRowStyle">
            <view class="flex items-center" style="gap: 6px">
              <view style="width: 8px; height: 8px; border-radius: 50%; background: var(--v5-warning); flex-shrink: 0" />
              <text style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ t.trial.stoppedNote }}</text>
            </view>
            <text class="block" style="margin-top: 4px; font-size: 12px; color: var(--v5-ink-3); line-height: 1.625">{{ offsetUsableUntilText }}</text>
          </view>

          <!-- Accrued credit + conversion CTA -->
          <view :style="creditWrapStyle">
            <view class="flex items-center justify-between">
              <text style="font-size: 12px; color: var(--v5-ink-3)">{{ t.trial.offsetAccruedLabel }}</text>
              <text class="font-mono-tabular" style="font-size: 15px; font-weight: 600; color: var(--v5-tech-cyan); white-space: nowrap">${{ trialOffset.offsetUSD.toFixed(2) }}</text>
            </view>
            <text v-if="trialOffset.remainderUSD > 0" class="block" :style="remainderNoteStyle">{{ offsetRemainderNote }}</text>
            <view class="w-full flex items-center justify-center active:scale-[0.98] active:opacity-85" :style="buyBtnStyle" role="button" tabindex="0" :aria-label="buyCtaText" @click="goCheckout">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
              <text style="margin-left: 6px">{{ buyCtaText }}</text>
            </view>
          </view>

          <!-- Rules entry -->
          <view class="w-full flex items-center justify-between active:opacity-70" :style="rulesEntryStyle" role="button" tabindex="0" :aria-label="t.trial.rulesEntry" @click="rulesOpen = true">
            <text style="font-size: 13px; color: var(--v5-ink-2)">{{ t.trial.rulesEntry }}</text>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg>
          </view>

          <view class="w-full flex items-center justify-center active:opacity-90" :style="goEarnStyle" role="button" tabindex="0" :aria-label="t.trial.goEarnCta" @click="goEarn">
            <text>{{ t.trial.goEarnCta }} →</text>
          </view>
        </template>

        <!-- ═══ none — claim intro ═══ -->
        <view v-else-if="status === 'none'" :style="idleCardStyle">
          <view class="grid place-items-center" :style="idleIconBoxStyle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z" /></svg>
          </view>
          <text class="block" :style="idleTitleStyle">{{ t.trial.idleTitleNew }}</text>
          <text class="block" :style="idleBodyStyle">{{ idleBody }}</text>
          <view
            class="inline-flex items-center justify-center"
            :class="canStartNow ? 'active:scale-[0.98]' : ''"
            :style="canStartNow ? idleCtaStyle : idleCtaDisabledStyle"
            role="button"
            tabindex="0"
            :aria-label="t.trial.idleCta"
            :aria-disabled="canStartNow ? 'false' : 'true'"
            @click="claim"
          >
            <text>{{ t.trial.idleCta }}</text>
          </view>
          <!-- Ineligible → concrete reason under the disabled CTA (异常2) -->
          <text v-if="!canStartNow" class="block" :style="reasonNoteStyle">{{ ineligibleReasonText }}</text>
        </view>

        <!-- ═══ ended — credit expired terminal ═══ -->
        <view v-else-if="status === 'ended'" :style="terminalCardStyle">
          <view class="grid place-items-center" :style="terminalIconBoxStyle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
          </view>
          <text class="block" :style="idleTitleStyle">{{ t.trial.endedTitle }}</text>
          <text class="block" :style="idleBodyStyle">{{ endedDesc }}</text>
          <view class="inline-flex items-center justify-center active:scale-[0.98]" :style="idleCtaStyle" role="button" tabindex="0" :aria-label="t.trial.buyCtaPlain" @click="goCheckout">
            <text>{{ t.trial.buyCtaPlain }}</text>
          </view>
        </view>

        <!-- ═══ converted — owned terminal ═══ -->
        <view v-else :style="terminalCardStyle">
          <view class="grid place-items-center" :style="terminalIconBoxStyle">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></svg>
          </view>
          <text class="block" :style="idleTitleStyle">{{ t.trial.convertedTitle }}</text>
          <text class="block" :style="idleBodyStyle">{{ t.trial.convertedDesc }}</text>
          <view class="inline-flex items-center justify-center active:opacity-70" :style="cooldownLinkStyle" role="button" tabindex="0" :aria-label="t.trial.convertedDevicesCta" @click="goDevices">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px"><rect width="20" height="8" x="2" y="2" rx="2" ry="2" /><rect width="20" height="8" x="2" y="14" rx="2" ry="2" /><line x1="6" x2="6.01" y1="6" y2="6" /><line x1="6" x2="6.01" y1="18" y2="18" /></svg>
            <text>{{ t.trial.convertedDevicesCta }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ═══ Rules half-sheet (spec ⑥「查看抵扣规则」) ═══ -->
    <view v-if="rulesOpen" class="trs-root" role="dialog" aria-modal="true">
      <view class="trs-backdrop" role="button" tabindex="0" @click="rulesOpen = false" />
      <view class="trs-panel" @click.stop>
        <view class="flex items-center justify-between">
          <text style="font-family: var(--font-v5); font-size: 15px; font-weight: 600; color: var(--v5-ink)">{{ t.trial.rulesTitle }}</text>
          <view class="grid place-items-center active:opacity-70" style="width: 36px; height: 36px; border-radius: 999px; background: var(--v5-surface-2)" role="button" tabindex="0" :aria-label="t.trial.sheetCloseAria" @click="rulesOpen = false">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </view>
        </view>
        <view style="margin-top: 14px; display: flex; flex-direction: column; gap: 10px">
          <view v-for="(line, i) in rulesLines" :key="i" class="flex items-start" style="gap: 8px">
            <view style="width: 6px; height: 6px; border-radius: 50%; background: var(--v5-brand); margin-top: 6px; flex-shrink: 0" />
            <text style="flex: 1; font-size: 13px; color: var(--v5-ink-2); line-height: 1.625; text-wrap: pretty">{{ line }}</text>
          </view>
        </view>
        <view class="w-full flex items-center justify-center active:scale-[0.98]" :style="rulesGotStyle" role="button" tabindex="0" :aria-label="t.trial.rulesGotCta" @click="rulesOpen = false">
          <text>{{ t.trial.rulesGotCta }}</text>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import CountdownHero from "@/components/me/trial-countdown-hero.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale, fmt } from "@/i18n/format";
import { geoPolicyErrorKind, geoPolicyUserMessage } from "@/api/geo-policy-error";
import { useFreeTrial, liveShadowUSD, liveShadowNEX, remainingMs } from "@/store/free-trial";
import { useTrialConfig, computeTrialOffset } from "@/store/trial-config";
import { useTrialClaimSheet } from "@/store/trial-claim-sheet";
import { navTo } from "@/lib/route";
import { useDialogA11y } from "@/composables/use-dialog-a11y";

const t = useT();
const freeTrial = useFreeTrial();
const trialConfig = useTrialConfig();

const cfg = computed(() => trialConfig.config);
const status = computed(() => freeTrial.status);

const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now();
  }, 1000);
});
onUnmounted(() => {
  if (ticker) clearInterval(ticker);
  ticker = null;
});

const isActiveCycle = computed(() => status.value === "active" || status.value === "grace");
const shadowUSD = computed(() => liveShadowUSD(now.value));
const shadowNEX = computed(() => liveShadowNEX(now.value));
const remainingMsValue = computed(() => remainingMs(now.value));
const trialOffset = computed(() => computeTrialOffset(cfg.value, shadowUSD.value));

const w = computed(() => t.value.trial);
const idleBody = computed(() => fmt(w.value.idleBody, { n: String(cfg.value.trialDays) }));
const offsetRemainderNote = computed(() => fmt(w.value.offsetRemainderNote, { remainder: trialOffset.value.remainderUSD.toFixed(2) }));
const offsetUsableUntilText = computed(() =>
  fmt(w.value.offsetUsableUntil, {
    time: freeTrial.graceEndsAt !== null ? new Date(freeTrial.graceEndsAt).toLocaleString(dateLocale()) : w.value.countdownDateEmpty,
  }),
);
const buyCtaText = computed(() =>
  status.value === "grace"
    ? fmt(w.value.graceBuyCta, { amount: trialOffset.value.offsetUSD.toFixed(2) })
    : fmt(w.value.buyCtaOffset, { amount: trialOffset.value.offsetUSD.toFixed(2) }),
);
const endedDesc = computed(() => {
  const at = freeTrial.finishedAt ?? freeTrial.graceEndsAt;
  return fmt(w.value.endedDesc, { time: at !== null ? new Date(at).toLocaleString(dateLocale()) : w.value.countdownDateEmpty });
});

// none-state eligibility (异常2 — concrete reason, never a generic error).
const canStartNow = computed(() => {
  void now.value; // re-evaluate each tick (eligibility isn't reactive on config alone)
  return freeTrial.canStart();
});
const ineligibleReasonText = computed(() => {
  const r = freeTrial.eligibility().reason;
  // PROD: this reason is served by GET /api/trial/eligibility, so a region
  // refusal arrives here as the reason code. Translate it first; `null` means an
  // ordinary reason, which the named branches below still handle unchanged.
  // 这里是**禁用 CTA 下方的常驻说明**,不是 toast —— 页面上没有任何重试控件。
  // 所以 unavailable 那条自带的「请重试」在这个位置是死胡同,换成本页既有的
  // 「晚点再来看看」口径(eligReasonClosed 同款),其余三条照常用。
  const geo = geoPolicyUserMessage(r, t.value.geoPolicy);
  if (geo) return geoPolicyErrorKind(r) === "unavailable" ? w.value.eligReasonClosed : geo;
  if (r === "converted") return w.value.eligReasonConverted;
  if (r === "used") return w.value.eligReasonUsed;
  if (r === "in-progress") return w.value.eligReasonInProgress;
  if (r === "risk") return w.value.eligReasonRisk;
  return w.value.eligReasonClosed;
});

// Rules sheet (spec ⑥: pre-purchase offset / no cash-out / post-purchase
// remainder → balance / expiry).
const rulesOpen = ref(false);
const rulesLines = computed(() => [
  fmt(w.value.rulesBefore, { cap: String(cfg.value.trialOffsetCapUSD) }),
  w.value.rulesNoCash,
  w.value.rulesAfter,
  fmt(w.value.rulesExpiry, { days: String(cfg.value.graceDays) }),
]);

function claim() {
  if (!canStartNow.value) return; // disabled CTA — reason line explains why
  useTrialClaimSheet().show();
}

// Conversion CTA → checkout. The trial context derives from store state
// (status ∈ active|grace ∧ product = trialProductId) — no URL marker, so the
// same link is the plain purchase entry once the trial has ended.
function goCheckout() {
  navTo(`/pages/store/checkout?product=${cfg.value.trialProductId}`);
}
function goEarn() {
  uni.navigateTo({ url: "/pages/earn/earn", fail: () => {} });
}
function goDevices() {
  uni.navigateTo({ url: "/pages/me/devices", fail: () => {} });
}

// ── styles — hairline-separated blocks on the page floor ──
const legacyNoteStyle: CSSProperties = { padding: "10px 2px 0" };
const stoppedRowStyle: CSSProperties = { padding: "13px 2px 0", borderTop: "1px solid var(--v5-border)" };
const creditWrapStyle: CSSProperties = { padding: "13px 2px 0", borderTop: "1px solid var(--v5-border)" };
const remainderNoteStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)", marginTop: "6px", lineHeight: 1.625, textWrap: "pretty" };
const buyBtnStyle: CSSProperties = { marginTop: "12px", width: "100%", height: "48px", borderRadius: "999px", background: "var(--v5-brand)", color: "var(--v5-on-brand)", fontSize: "13px", fontWeight: 600 };
const rulesEntryStyle: CSSProperties = { minHeight: "44px", padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
const goEarnStyle: CSSProperties = { width: "100%", height: "44px", borderRadius: "999px", background: "var(--v5-surface-2)", fontSize: "13px", color: "var(--v5-ink-2)" };
const idleCardStyle: CSSProperties = {
  borderRadius: "16px",
  border: "1px dashed var(--v5-border-strong)",
  background: "color-mix(in srgb, var(--v5-surface) 40%, transparent)",
  padding: "32px 20px",
  textAlign: "center",
};
const idleIconBoxStyle: CSSProperties = { width: "48px", height: "48px", borderRadius: "999px", background: "color-mix(in srgb, var(--v5-brand) 15%, transparent)", margin: "0 auto" };
const idleTitleStyle: CSSProperties = { marginTop: "12px", fontSize: "15px", fontWeight: 600, color: "var(--v5-ink)" };
const idleBodyStyle: CSSProperties = { marginTop: "4px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.375, padding: "0 8px", textWrap: "pretty" };
const idleCtaStyle: CSSProperties = { marginTop: "16px", height: "48px", padding: "0 24px", borderRadius: "999px", background: "var(--v5-brand)", color: "var(--v5-on-brand)", fontSize: "13px", fontWeight: 600 };
const idleCtaDisabledStyle: CSSProperties = { marginTop: "16px", height: "48px", padding: "0 24px", borderRadius: "999px", background: "var(--v5-surface-2)", color: "var(--v5-ink-4)", fontSize: "13px", fontWeight: 600 };
const reasonNoteStyle: CSSProperties = { marginTop: "8px", fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.625, textWrap: "pretty" };
const terminalCardStyle: CSSProperties = { borderRadius: "16px", background: "var(--v5-surface)", padding: "24px 20px", textAlign: "center" };
const terminalIconBoxStyle: CSSProperties = { width: "48px", height: "48px", borderRadius: "999px", background: "var(--v5-surface-2)", margin: "0 auto" };
const cooldownLinkStyle: CSSProperties = { marginTop: "16px", minHeight: "44px", fontSize: "13px", color: "var(--v5-ink-2)" };
const rulesGotStyle: CSSProperties = { marginTop: "18px", height: "48px", borderRadius: "999px", background: "var(--v5-brand)", color: "var(--v5-on-brand)", fontSize: "13px", fontWeight: 600 };

// 遮罩只拦指针不拦键盘:不接这一层,弹层打开后 Tab 会直接走到背景(那里有花钱的按钮),
// 且没有 Esc、关掉后焦点也回不到触发它的控件。
useDialogA11y(computed(() => rulesOpen.value), ".trs-root", () => { rulesOpen.value = false; });
</script>

<style scoped>
.trs-root {
  position: fixed;
  inset: 0;
  z-index: 790;
}
.trs-backdrop {
  position: absolute;
  inset: 0;
  background: var(--v5-bg-color-mask);
  backdrop-filter: blur(8px) saturate(150%);
  -webkit-backdrop-filter: blur(8px) saturate(150%);
  animation: trs-fade 0.24s ease-out;
}
.trs-panel {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 800;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  background: var(--v5-surface);
  border-top: 1px solid var(--v5-border);
  padding: 20px 16px;
  padding-bottom: calc(env(safe-area-inset-bottom) + 38px);
  animation: trs-slide-up 0.36s cubic-bezier(0.16, 1, 0.3, 1);
}
@keyframes trs-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes trs-slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
@media (prefers-reduced-motion: reduce) {
  .trs-backdrop, .trs-panel { animation: none; }
}
</style>
