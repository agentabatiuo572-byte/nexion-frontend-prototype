<!--
  Rank · How it works — migrated onto the shared how/* component system in the
  2026-07 de-card sweep (was 6 page-local surface+border section cards with
  nested sub-cards). HowHero + HowSection(violet) + HowCalloutBox + HowIconRow +
  HowFaqRow; ladder/requirements/phases stay page-local (VBadgeIcon ladder is
  unique to this page). violet accent = brand-2, preserving the rank page's
  visual identity.
-->
<template>
  <AppChassis active="team">
    <view class="pb-8" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/rank" />

      <!-- Hero -->
      <HowHero :label="w.heroLabel" :title="w.heroTitle" :sub="w.heroSub" accent="violet" />

      <!-- §1 What is the Rank System -->
      <HowSection :title="w.s1Title" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>
        </template>
        <text class="block" :style="bodyStyle">{{ w.s1Para1 }}</text>
        <text class="block" :style="{ ...bodyStyle, marginTop: '10px' }">{{ w.s1Para2 }}</text>
      </HowSection>

      <!-- §2 13 ranks at a glance -->
      <HowSection :title="w.s2Title" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" /><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" /><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ w.s2Caption }}</text>
        <!-- Ladder — transparent row group on the page floor -->
        <view style="margin-top: 14px; padding: 0 2px; display: flex; flex-direction: column; gap: 7px">
          <view v-for="r in V_RANKS" :key="r.v" class="flex items-center" style="gap: 10px">
            <VBadgeIcon :v="r.v" :size="22" />
            <text class="font-display tabular-nums" :style="ladderVStyle">V{{ r.v }}</text>
            <text :style="ladderTitleStyle">{{ r.title }}</text>
            <text v-if="isZh" class="truncate" :style="ladderCnStyle">· {{ r.cnTitle }}</text>
          </view>
        </view>
      </HowSection>

      <!-- §3 How to level up -->
      <HowSection :title="w.s3Title" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z" /></svg>
        </template>
        <text class="block" :style="{ ...captionStyle, marginBottom: '14px' }">{{ w.s3Intro }}</text>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <view v-for="req in requirements" :key="req.label" class="rounded-xl" :style="reqCardStyle">
            <text class="block" :style="reqLabelStyle">{{ req.label }}</text>
            <text class="block" :style="reqBodyStyle">{{ req.body }}</text>
          </view>
        </view>
        <HowCalloutBox :title="'⚠️ ' + w.s3RuleATitle" :body="w.s3RuleABody" tone="amber" />
        <HowCalloutBox :title="'✓ ' + w.s3RuleBTitle" :body="w.s3RuleBBody" tone="purple" />
      </HowSection>

      <!-- §4 What you unlock -->
      <HowSection :title="w.s4Title" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="8" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5" /></svg>
        </template>
        <text class="block" :style="captionStyle">{{ w.s4Intro }}</text>
        <view style="margin-top: 14px; display: flex; flex-direction: column; gap: 10px">
          <HowIconRow v-for="u in unlocks" :key="u.label" :emoji="u.emoji" :label="u.label" :body="u.body" />
        </view>
      </HowSection>

      <!-- §5 Worked example -->
      <HowSection :title="w.s5Title" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        </template>
        <text class="block" :style="{ fontSize: '13px', lineHeight: 1.6, color: 'var(--v5-ink-3)' }">{{ w.s5Intro }}</text>

        <view class="rounded-xl" :style="startCardStyle">
          <text class="block" :style="startLabelStyle">{{ w.s5StartLabel }}</text>
          <text class="block" :style="bodyStyle">{{ w.s5StartBody }}</text>
        </view>

        <view style="margin-top: 14px; display: flex; flex-direction: column; gap: 14px">
          <HowStepRow v-for="ph in phases" :key="ph.n" :n="ph.n" :title="ph.title" :body="ph.body" accent="violet" />
        </view>

        <HowCalloutBox :title="'⚡ ' + w.s5TriggerLabel" :body="w.s5TriggerBody" tone="purple" />

        <view class="rounded-xl border" :style="unlockResultCardStyle">
          <text class="block" :style="unlockResultLabelStyle">🎉 {{ w.s5UnlockLabel }}</text>
          <view style="display: flex; flex-direction: column; gap: 4px">
            <text class="block" :style="unlockResultItemStyle">• {{ w.s5Unlock1 }}</text>
            <text class="block" :style="unlockResultItemStyle">• {{ w.s5Unlock2 }}</text>
            <text class="block" :style="unlockResultItemStyle">• {{ w.s5Unlock3 }}</text>
            <text class="block" :style="unlockResultItemStyle">• {{ w.s5Unlock4 }}</text>
          </view>
        </view>
      </HowSection>

      <!-- §6 FAQ -->
      <HowSection :title="w.faqTitle" accent="violet">
        <template #icon>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg>
        </template>
        <view style="display: flex; flex-direction: column; gap: 10px">
          <HowFaqRow v-for="faq in faqs" :key="faq.q" :q="faq.q" :a="faq.a" />
        </view>
      </HowSection>

      <!-- Footer CTA -->
      <view class="mx-4 mt-6">
        <view class="flex items-center justify-center active:scale-[0.98]" :style="ctaStyle" @click="goBack">
          <text :style="ctaTextStyle">{{ w.ctaBack }}</text>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadgeIcon from "@/components/team/v-badge-icon.vue";
import HowHero from "@/components/how/how-hero.vue";
import HowSection from "@/components/how/how-section.vue";
import HowCalloutBox from "@/components/how/how-callout-box.vue";
import HowIconRow from "@/components/how/how-icon-row.vue";
import HowStepRow from "@/components/how/how-step-row.vue";
import HowFaqRow from "@/components/how/how-faq-row.vue";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { navBack } from "@/lib/route";
import { V_RANKS } from "@/store/v-rank";

const t = useT();
const w = computed(() => t.value.rankHowItWorks);
// 中文头衔只给中文用户看 —— 与 network-card.vue:83 的 titleOf 同一条守卫。
// 缺它时 en/vi 用户会在 V 级阶梯上读到 13 行中文(独立审计实测)。
const locale = useLocaleStore();
const isZh = computed(() => locale.code === "zh");

const requirements = computed(() => [
  { label: w.value.req1Label, body: w.value.req1Body },
  { label: w.value.req2Label, body: w.value.req2Body },
  { label: w.value.req3Label, body: w.value.req3Body },
  { label: w.value.req4Label, body: w.value.req4Body },
]);
const unlocks = computed(() => [
  { emoji: "📈", label: w.value.unlock1Label, body: w.value.unlock1Body },
  { emoji: "🤝", label: w.value.unlock2Label, body: w.value.unlock2Body },
  { emoji: "🏆", label: w.value.unlock3Label, body: w.value.unlock3Body },
  { emoji: "🌱", label: w.value.unlock5Label, body: w.value.unlock5Body },
]);
const phases = computed(() => [
  { n: 1, title: w.value.s5Phase1Title, body: w.value.s5Phase1Body },
  { n: 2, title: w.value.s5Phase2Title, body: w.value.s5Phase2Body },
  { n: 3, title: w.value.s5Phase3Title, body: w.value.s5Phase3Body },
]);
const faqs = computed(() => [
  { q: w.value.faqQ1, a: w.value.faqA1 },
  { q: w.value.faqQ2, a: w.value.faqA2 },
  { q: w.value.faqQ3, a: w.value.faqA3 },
]);

function goBack() {
  navBack("/pages/team/rank");
}

// ─── styles ───
// Section shells / hero / callouts now come from the how/* components; only
// page-local content styles remain.
const bodyStyle: CSSProperties = { fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 }; // how-page scale: body 13.5/1.65 ink-2
const captionStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", lineHeight: 1.6 }; // how-page scale: caption 12.5/1.6 ink-3

const ladderVStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-3)", width: "28px" };
const ladderTitleStyle: CSSProperties = { fontSize: "12px", color: "color-mix(in srgb, var(--v5-ink) 90%, transparent)", fontWeight: 500 };
const ladderCnStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-4)" };

// Requirement tiles — filled, no border (single visual difference).
const reqCardStyle: CSSProperties = { background: "var(--v5-surface-2)", padding: "10px 12px" };
const reqLabelStyle: CSSProperties = { fontSize: "13px", fontWeight: 600, color: "var(--v5-brand)" };
const reqBodyStyle: CSSProperties = { marginTop: "5px", fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.62 }; // how-row scale: body 13/1.62 ink-2

// Worked-example start tile — filled, no border.
const startCardStyle: CSSProperties = { marginTop: "14px", background: "var(--v5-surface-2)", padding: "12px 14px" };
const startLabelStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.14em", color: "var(--v5-brand-2)", marginBottom: "4px" };

const unlockResultCardStyle: CSSProperties = {
  marginTop: "8px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
  borderColor: "color-mix(in srgb, var(--v5-brand-2) 30%, transparent)",
  padding: "12px",
};
const unlockResultLabelStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.14em", color: "var(--v5-brand-2)", marginBottom: "6px" };
const unlockResultItemStyle: CSSProperties = { fontSize: "12px", color: "var(--v5-ink-2)", lineHeight: 1.5 };


const ctaStyle: CSSProperties = { gap: "8px", height: "48px", borderRadius: "999px", background: "var(--v5-brand)" };
const ctaTextStyle: CSSProperties = { color: "var(--v5-on-brand)", fontSize: "15px", fontWeight: 600 };
</script>
