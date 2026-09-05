<!--
  Agent — ported from Nexion-prototype/app/(main)/team/agent/page.tsx.
  Regional Ambassador dashboard (V5+ gated), de-carded: floor hero →
  eligibility tint banner (eligible / locked + path CTA) → 4 reimbursable
  buckets (transparent hairline rows) → application form on the floor
  (recessed fields, gated submit) → approved-case rows. Sub-page →
  <AppChassis active="team"> with in-page back row. Reuses v-rank store +
  v-badge. lucide → inline SVG; <input>→uni input; toast via store/ui.
-->
<template>
  <AppChassis active="team">
    <view class="pb-6" style="color: var(--v5-ink)">
      <SubPageHeader back="/pages/team/team" :title="t.headerTitles.teamAgent" />

      <view class="px-4" style="display: flex; flex-direction: column; gap: 12px; padding-top: 18px">
        <!-- hero — de-carded: sits on the page floor (radial glow deleted outright) -->
        <view :style="heroStyle">
          <view class="flex items-center" style="gap: 10px">
            <view class="rounded-xl grid place-items-center" :style="heroIconStyle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></svg>
            </view>
            <view class="flex-1">
              <text class="block font-mono-tabular" :style="heroCapStyle">{{ t.agent.heroLabel }}</text>
              <text class="block font-display" :style="heroHeadlineStyle">{{ t.agent.heroHeadline }}</text>
            </view>
          </view>
          <text class="block" :style="heroBodyStyle">{{ t.agent.heroBody }}</text>
        </view>

        <!-- eligibility -->
        <view v-if="unlocked" class="rounded-2xl" :style="eligibleStyle">
          <view class="flex items-center" style="gap: 12px">
            <view class="rounded-xl grid place-items-center" :style="eligibleIconStyle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
            </view>
            <view class="flex-1">
              <view class="flex items-center" style="gap: 6px">
                <text :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ t.agent.eligible }}</text>
                <VBadge :v="myRank" size="sm" :show-title="false" />
              </view>
              <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ t.agent.annualBudget }}</text>
            </view>
          </view>
        </view>
        <view v-else class="rounded-2xl" :style="lockedStyle">
          <view class="flex items-center" style="gap: 12px">
            <view class="rounded-xl grid place-items-center" :style="lockedIconStyle">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            </view>
            <view class="flex-1">
              <text class="block" :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ t.agent.lockedReq }}</text>
              <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ lockedSubText }}</text>
            </view>
            <view class="shrink-0 rounded-full flex items-center active:scale-95" :style="pathCtaStyle" @click="go('/pages/team/rank')">
              <text>{{ t.agent.pathCta }}</text>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </view>
          </view>
        </view>

        <!-- buckets — transparent hairline rows -->
        <view :style="bucketsGroupStyle">
          <!-- 反馈用 scale 不用 opacity:bucketRowStyle 在 inline style 里写了 opacity(锁定态 0.7),
               inline 优先级压过 class 生成的 .active\:opacity-70:active,写 opacity 反馈两种状态下都失效。 -->
          <view
            v-for="(b, i) in BUCKETS"
            :key="b.id"
            class="flex items-start active:scale-[0.98] transition-transform"
            :style="bucketRowStyle(i === BUCKETS.length - 1)"
            role="button"
            tabindex="0"
            :aria-label="b.title"
            @click.capture="selectBucket(b)"
          >
            <view class="rounded-xl grid place-items-center shrink-0" :style="bucketIconStyle(b.tint)">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" :stroke="b.tint" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(p, pi) in b.paths" :key="pi" :d="p" /></svg>
            </view>
            <view class="flex-1 min-w-0">
              <view class="flex items-center justify-between">
                <text :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ b.title }}</text>
                <text class="font-display tabular-nums" :style="{ fontSize: '13px', fontWeight: 600, color: b.tint }">{{ b.range }}</text>
              </view>
              <text class="block" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px', lineHeight: 1.375 }">{{ b.rule }}</text> <!-- SKILL: leading-snug=1.375 (was 1.4) -->
            </view>
          </view>
        </view>
        <text v-if="selectedBucketTitle" class="block text-center" :style="selectedBucketStyle">{{ selectedBucketTitle }} · {{ t.agent.newApplication }}</text>

        <!-- application form — transparent block, recessed fields -->
        <view :style="formBlockStyle">
          <text class="block font-mono-tabular" :style="formCapStyle">{{ t.agent.newApplication }}</text>
          <view style="display: flex; flex-direction: column; gap: 8px">
            <view :style="fieldStyle">
              <view class="flex items-center" style="gap: 6px; margin-bottom: 4px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                <text class="font-mono-tabular" :style="fieldLabelStyle">{{ t.agent.fieldEventDate }}</text>
              </view>
              <input
                v-model="date"
                type="text"
                :disabled="!unlocked"
                placeholder="YYYY-MM-DD"
                :style="inputStyle"
                placeholder-style="color: var(--v5-ink-2)"
              />
            </view>
            <view :style="fieldStyle">
              <view class="flex items-center" style="gap: 6px; margin-bottom: 4px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></svg>
                <text class="font-mono-tabular" :style="fieldLabelStyle">{{ t.agent.fieldCity }}</text>
              </view>
              <input
                v-model="city"
                type="text"
                :disabled="!unlocked"
                :placeholder="t.agent.cityPlaceholder"
                :style="inputStyle"
                placeholder-style="color: var(--v5-ink-2)"
              />
            </view>
            <view :style="fieldStyle">
              <view class="flex items-center" style="gap: 6px; margin-bottom: 4px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" /></svg>
                <text class="font-mono-tabular" :style="fieldLabelStyle">{{ t.agent.fieldBudget }}</text>
              </view>
              <view class="flex items-center">
                <text class="font-display" :style="{ fontSize: '13px', color: 'var(--v5-ink-3)', marginRight: '4px' }">$</text>
                <input
                  v-model="budgetText"
                  type="number"
                  :disabled="!unlocked"
                  :style="budgetInputStyle"
                  @input="onBudgetInput"
                />
              </view>
            </view>
          </view>

          <view class="rounded-full flex items-center justify-center active:scale-[0.98]" :style="submitStyle" @click="submit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :stroke="unlocked ? 'var(--v5-on-brand)' : 'var(--v5-ink-4)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
            <text>{{ unlocked ? t.agent.submitForReview : t.agent.lockedV5 }}</text>
          </view>

          <text v-if="!unlocked" class="block text-center" :style="previewOnlyStyle">{{ t.agent.previewOnly }}</text>
        </view>

        <!-- approved cases — transparent hairline rows -->
        <view v-if="remoteApiEnabled && latestApplication.status !== 'NONE'" :style="casesBlockStyle">
          <text class="block font-mono-tabular" :style="approvedCapStyle">{{ t.agent.serverApplication }}</text>
          <view :style="casesGroupStyle">
            <view :style="caseRowStyle(true)">
              <view class="flex items-start justify-between">
                <view>
                  <text class="block" :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ latestApplication.city }} · {{ latestApplication.eventDate }}</text>
                  <text class="block font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ applicationProof }}</text>
                </view>
                <text class="font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-brand)' }">{{ applicationStatusText }}</text>
              </view>
            </view>
          </view>
        </view>

        <view v-if="!remoteApiEnabled" :style="casesBlockStyle">
          <text class="block font-mono-tabular" :style="approvedCapStyle">{{ t.agent.recentlyApproved }}</text>
          <view :style="casesGroupStyle">
            <view v-for="(c, i) in APPROVED_CASES" :key="i" :style="caseRowStyle(i === APPROVED_CASES.length - 1)">
              <view class="flex items-start justify-between">
                <view>
                  <text class="block" :style="{ fontSize: '13px', fontWeight: 600, color: 'var(--v5-ink)' }">{{ c.name }}</text>
                  <text class="block font-mono-tabular" :style="{ fontSize: '12px', color: 'var(--v5-ink-3)', marginTop: '2px' }">{{ hostedByText(c) }}</text>
                </view>
                <text class="font-display tabular-nums" :style="{ fontSize: '15px', fontWeight: 600, color: 'var(--v5-brand)' }">${{ c.amount.toLocaleString() }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, type CSSProperties } from "vue";
import { onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import VBadge from "@/components/team/v-badge.vue";
import { useVRank } from "@/store/v-rank";
import { rankTitle } from "@/lib/v-rank-copy";
import { useLocaleStore } from "@/store/locale";
import { useT } from "@/i18n/use-t";
import { fmt } from "@/i18n/format";
import { toast } from "@/store/ui";
import { useApp } from "@/store/app";
import { ambassadorApplicationApi, remoteApiEnabled } from "@/api/runtime";
import type { AmbassadorApplication, AmbassadorApplicationInput } from "@/api/ambassador-application-api";
import { isSettledRejection } from "@/api/errors";
import { acquireAmbassadorCommandKey, finishAmbassadorCommand } from "@/lib/ambassador-command-key";

const t = useT();
const vrank = useVRank();
const isZh = computed(() => useLocaleStore().code === "zh");
const app = useApp();

const myRank = computed(() => vrank.myRank);
const unlocked = computed(() => vrank.myRank >= 5);

interface Bucket {
  id: string;
  title: string;
  range: string;
  rule: string;
  tint: string;
  paths: string[];
}
const BUCKETS = computed<Bucket[]>(() => [
  {
    id: "venue",
    title: t.value.agent.buckets.venue.title,
    range: "$1,000 — $10,000",
    rule: t.value.agent.buckets.venue.rule,
    tint: "var(--v5-brand)",
    paths: ["M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z", "M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2", "M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2", "M10 6h4M10 10h4M10 14h4M10 18h4"],
  },
  {
    id: "kol",
    title: t.value.agent.buckets.kol.title,
    range: t.value.agent.bucketRangeFlat,
    rule: t.value.agent.buckets.kol.rule,
    tint: "var(--v5-tech-cyan)",
    paths: ["m3 11 18-5v12L3 14v-3z", "M11.6 16.8a3 3 0 1 1-5.8-1.6"],
  },
  {
    id: "print",
    title: t.value.agent.buckets.print.title,
    range: t.value.agent.bucketRangeQuota,
    rule: t.value.agent.buckets.print.rule,
    tint: "var(--v5-warning)",
    paths: ["M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M6 9V2h12v7", "M6 14h12v8H6z"],
  },
  {
    id: "dev",
    title: t.value.agent.buckets.dev.title,
    range: t.value.agent.bucketRangeHourly,
    rule: t.value.agent.buckets.dev.rule,
    tint: "var(--v5-tech-cyan)",
    paths: ["m16 18 6-6-6-6", "m8 6-6 6 6 6"],
  },
]);

interface ApprovedCase {
  name: string;
  host: string;
  amount: number;
  attendees: number;
}
const APPROVED_CASES: ApprovedCase[] = [
  { name: "Tokyo Web3 Summit", host: "Sarah K.", amount: 8500, attendees: 247 },
  { name: "Berlin DePIN Meetup", host: "Marina K.", amount: 3200, attendees: 142 },
  { name: "São Paulo AI Devcon", host: "Diego P.", amount: 6700, attendees: 198 },
];

const date = ref("");
const city = ref("");
const budget = ref(3000);
const budgetText = ref("3000");
const selectedBucketTitle = ref("");
const selectedBucketId = ref<AmbassadorApplicationInput["bucket"] | "">("");
const submitting = ref(false);
const latestApplication = ref<AmbassadorApplication>({ applicationId: null, status: "NONE", city: null,
  eventDate: null, budgetUsdt: null, bucket: null, submittedAt: null, source: "server",
  sourceEnvironment: "PRODUCTION", runId: "" });

const applicationStatusText = computed(() => t.value.agent.applicationStatuses[latestApplication.value.status]);
const applicationProof = computed(() => latestApplication.value.sourceEnvironment === "SANDBOX"
  ? `SANDBOX · Run ${latestApplication.value.runId}` : "PRODUCTION · server");

function onBudgetInput() {
  const n = Math.max(0, parseInt(budgetText.value.replace(/\D/g, "")) || 0);
  budget.value = n;
}

const lockedSubText = computed(() =>
  fmt(t.value.agent.lockedSub, { n: vrank.myRank, title: rankTitle(vrank.myRank, isZh.value, vrank.ladder) }),
);
function hostedByText(c: ApprovedCase): string {
  return fmt(t.value.agent.hostedBy, { name: c.host, attendees: c.attendees });
}

function selectBucket(b: Bucket) {
  selectedBucketTitle.value = b.title;
  selectedBucketId.value = b.id as AmbassadorApplicationInput["bucket"];
}

function payloadIdentity(input: AmbassadorApplicationInput): string {
  return JSON.stringify([input.eventDate, input.city.trim(), input.budgetUsdt, input.bucket]);
}

function matches(input: AmbassadorApplicationInput, value: AmbassadorApplication): boolean {
  return value.status !== "NONE" && value.eventDate === input.eventDate && value.city === input.city.trim()
    && value.budgetUsdt === input.budgetUsdt && value.bucket === input.bucket;
}

async function refreshLatest(expectedAccount = app.accountKey): Promise<AmbassadorApplication> {
  const value = await ambassadorApplicationApi.latest();
  if (app.accountKey === expectedAccount) latestApplication.value = value;
  return value;
}

async function submit() {
  if (!unlocked.value) {
    toast.error(t.value.agent.toastV5Required, t.value.agent.toastV5RequiredSub);
    return;
  }
  if (!date.value || !city.value) {
    toast.error(t.value.agent.toastMissingFields, t.value.agent.toastMissingFieldsSub);
    return;
  }
  if (!selectedBucketId.value) {
    toast.error(t.value.agent.toastMissingFields, t.value.agent.toastBucketRequired);
    return;
  }
  if (remoteApiEnabled) {
    if (submitting.value) return;
    const input: AmbassadorApplicationInput = { eventDate: date.value, city: city.value.trim(),
      budgetUsdt: budget.value, bucket: selectedBucketId.value };
    const identity = payloadIdentity(input);
    const expectedAccount = app.accountKey;
    const key = acquireAmbassadorCommandKey(expectedAccount, identity);
    submitting.value = true;
    try {
      const result = await ambassadorApplicationApi.submit(input, key);
      if (app.accountKey !== expectedAccount) return;
      latestApplication.value = result;
      finishAmbassadorCommand(expectedAccount, identity);
    } catch (error) {
      if (app.accountKey !== expectedAccount) return;
      try {
        const authoritative = await refreshLatest(expectedAccount);
        if (matches(input, authoritative)) {
          finishAmbassadorCommand(expectedAccount, identity);
        } else if (isSettledRejection(error)) {
          finishAmbassadorCommand(expectedAccount, identity);
          throw error;
        } else {
          throw error;
        }
      } catch (readError) {
        if (isSettledRejection(error)) finishAmbassadorCommand(expectedAccount, identity);
        toast.error(t.value.agent.toastRemoteFailed, readError instanceof Error ? readError.message : String(readError));
        return;
      }
    } finally {
      submitting.value = false;
    }
  }
  toast.success(
    t.value.agent.toastSubmitted,
    fmt(t.value.agent.toastSubmittedSub, { city: city.value, budget: budget.value.toLocaleString() }),
  );
  date.value = "";
  city.value = "";
  budget.value = 3000;
  budgetText.value = "3000";
  selectedBucketId.value = "";
  selectedBucketTitle.value = "";
}

onShow(() => {
  if (remoteApiEnabled) {
    const expectedAccount = app.accountKey;
    void Promise.all([
      refreshLatest(expectedAccount).catch(() => undefined),
      vrank.refreshCanonicalVRank(),
    ]);
  }
});

function go(url: string) {
  uni.navigateTo({ url, fail: () => {} });
}

// ─── styles ───
// De-carded hero on the page floor — the old radial glow card was a page-floor
// aura → deleted outright (owner call 2026-07-08), not re-tuned.
const heroStyle: CSSProperties = { padding: "6px 2px 0" };
const heroIconStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  background: "color-mix(in srgb, var(--v5-warning) 20%, transparent)",
};
const heroCapStyle: CSSProperties = { fontSize: "12px", fontWeight: 500, letterSpacing: "0.06em", color: "var(--v5-warning)" };
const heroHeadlineStyle: CSSProperties = { fontSize: "20px", fontWeight: 600, lineHeight: 1.25, marginTop: "2px" }; // SKILL: leading-tight=1.25 (was 1.2)
// Paragraph tier: 13.5 / 1.65 / ink-2 (body copy must not sit in ink-3).
const heroBodyStyle: CSSProperties = { marginTop: "10px", fontSize: "13px", color: "var(--v5-ink-2)", lineHeight: 1.65 };

// Status banners — tint fill only, border chrome dropped (single difference).
const eligibleStyle: CSSProperties = {
  padding: "16px",
  background: "color-mix(in srgb, var(--v5-brand) 8%, transparent)",
};
const eligibleIconStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  background: "color-mix(in srgb, var(--v5-brand) 20%, transparent)",
};
const lockedStyle: CSSProperties = {
  padding: "16px",
  background: "color-mix(in srgb, var(--v5-brand-2) 10%, transparent)",
};
const lockedIconStyle: CSSProperties = {
  width: "40px",
  height: "40px",
  background: "color-mix(in srgb, var(--v5-brand-2) 20%, transparent)",
};
const pathCtaStyle: CSSProperties = {
  padding: "0 12px",
  height: "44px",
  gap: "4px",
  background: "var(--v5-brand-2)",
  color: "var(--v5-on-brand-2)", // bright brand-2 fill → on-brand-2 text (incl. svg stroke)
  fontSize: "12px",
  fontWeight: 600,
};

// Transparent hairline rows — border-top opens the group, +12px top margin for
// 24px section rhythm. SKILL: opacity still gates on unlocked (1 / 0.7).
const bucketsGroupStyle: CSSProperties = { marginTop: "12px", padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
function bucketRowStyle(isLast: boolean): CSSProperties {
  return {
    padding: "13px 0",
    gap: "12px",
    opacity: unlocked.value ? 1 : 0.7,
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
const selectedBucketStyle: CSSProperties = {
  marginTop: "-4px",
  fontFamily: "var(--font-jet-mono), ui-monospace, monospace",
  fontSize: "12px",
  color: "var(--v5-brand-2)",
};
function bucketIconStyle(tint: string): CSSProperties {
  return {
    width: "40px",
    height: "40px",
    // SKILL: prototype `${tint}18` is 8-digit hex alpha 0x18=24/255≈9% (was mis-ported as 18%)
    background: `color-mix(in srgb, ${tint} 9%, transparent)`,
  };
}

// Transparent form block — 2px optical inset, +12px top margin (24px rhythm).
const formBlockStyle: CSSProperties = { marginTop: "12px", padding: "0 2px" };
const formCapStyle: CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-ink-3)",
  marginBottom: "12px",
};
// 输入框零描边。外层 formBlockStyle 只有 margin/padding 无底色 → 字段贴页面底;
// 原 surface-3 亮色下对页面底仅 ΔE 2.7(分不出),改 L1。
const fieldStyle: CSSProperties = {
  background: "var(--v5-surface)",
  borderRadius: "12px",
  padding: "10px 12px",
};
const fieldLabelStyle: CSSProperties = { fontSize: "12px", letterSpacing: "0.05em", color: "var(--v5-ink-3)" };
const inputStyle: CSSProperties = {
  width: "100%",
  background: "transparent",
  fontSize: "15px",
  color: "var(--v5-ink)",
};
const budgetInputStyle: CSSProperties = {
  flex: "1",
  background: "transparent",
  fontSize: "15px",
  color: "var(--v5-ink)",
  fontFamily: "var(--font-v5)",
};
const submitStyle = computed<CSSProperties>(() => ({
  marginTop: "12px",
  height: "48px",
  gap: "6px",
  fontSize: "15px",
  fontWeight: 600,
  background: unlocked.value ? "var(--v5-brand)" : "var(--v5-surface-2)",
  color: unlocked.value ? "var(--v5-on-brand)" : "var(--v5-ink-4)",
}));
const previewOnlyStyle: CSSProperties = {
  marginTop: "8px",
  fontSize: "12px",
  color: "var(--v5-ink-3)",
};

// Transparent hairline rows — cap label outside, border-top opens the group.
const casesBlockStyle: CSSProperties = { marginTop: "12px" };
const approvedCapStyle: CSSProperties = {
  padding: "0 2px",
  marginBottom: "8px",
  fontSize: "12px",
  fontWeight: 500,
  letterSpacing: "0.06em",
  color: "var(--v5-ink-3)",
};
const casesGroupStyle: CSSProperties = { padding: "0 2px", borderTop: "1px solid var(--v5-border)" };
function caseRowStyle(isLast: boolean): CSSProperties {
  return {
    padding: "12px 0",
    borderBottom: isLast ? "none" : "1px solid var(--v5-border)",
  };
}
</script>
