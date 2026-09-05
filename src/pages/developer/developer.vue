<!--
  Developer Hub — ported from Nexion-prototype/app/(main)/developer/page.tsx.

  Hero + 4-tab segmented control (Overview / Docs / API keys / Webhooks).
  Overview: 4 API cards + partner grid + request-access form (3 inputs +
  submit → toast). Docs/keys/webhooks: empty/preview states.

  Wrapped in <AppChassis active="me"> (reached from /me). SetPageHeader
  backHref="/me" → SubPageHeader back="/pages/me/me". SegmentedControl →
  inline pill tabs (mirrors earn.vue PillTabs). Banned hex from source
  (#3DA9FF accent, #0F0F0F gradient stop) → var(--v5-tech-cyan) + surface
  tokens. lucide → inline <svg>.
-->
<template>
  <AppChassis active="me">
    <view style="color: var(--v5-ink)" class="pb-2">
      <SubPageHeader back="/pages/me/me" />

      <!-- Hero -->
      <view class="mx-4 border rounded-2xl relative overflow-hidden" :style="heroStyle">
        <view class="absolute grid place-items-center" :style="heroIconBoxStyle">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m16 18 6-6-6-6" /><path d="m8 6-6 6 6 6" /></svg>
        </view>
        <text class="block" style="font-size: 12px; letter-spacing: 0.18em; color: var(--v5-tech-cyan)">{{ t.developer.headline }}</text>
        <text class="block" :style="heroTaglineStyle">{{ t.developer.tagline }}</text>
        <view v-if="!remoteApiEnabled" class="mt-4 flex flex-wrap" style="gap: 6px">
          <text class="block" :style="badgeStyle">{{ t.developer.badgeEnterprise }}</text>
          <text class="block" :style="badgeStyle">{{ t.developer.badgeUptime }}</text>
          <text class="block" :style="badgeStyle">{{ t.developer.badgeAuth }}</text>
        </view>
      </view>

      <!-- Tabs — SegmentedControl (HIG 44pt, accent = tech-cyan) -->
      <view class="mx-4 mt-3">
        <view class="grid" :style="segWrapStyle">
          <view v-for="o in tabOptions" :key="o.value" class="grid place-items-center active:opacity-70" :style="pillStyle(o.value)" @click="tab = o.value">
            <text :style="pillLabelStyle(o.value)">{{ o.label }}</text>
          </view>
        </view>
      </view>

      <!-- Overview -->
      <template v-if="tab === 'overview'">
        <view class="mx-4 mt-3" :style="apiListStyle">
          <view v-for="(c, i) in apiCards" :key="c.title" class="flex items-start" :style="apiRowStyle(i === apiCards.length - 1)">
            <view class="grid place-items-center shrink-0" :style="apiIconBoxStyle(c.color)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" :stroke="c.color" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path v-for="(d, di) in c.icon" :key="di" :d="d" /><template v-for="(r, ri) in (c.rects || [])" :key="`r${ri}`"><rect :x="r.x" :y="r.y" :width="r.w" :height="r.h" :rx="r.rx" /></template><template v-for="(e, ei) in (c.ellipses || [])" :key="`e${ei}`"><ellipse :cx="e.cx" :cy="e.cy" :rx="e.rx" :ry="e.ry" /></template><template v-for="(ln, li) in (c.lines || [])" :key="`l${li}`"><line :x1="ln.x1" :y1="ln.y1" :x2="ln.x2" :y2="ln.y2" /></template></svg>
            </view>
            <view class="flex-1">
              <text class="block" style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ c.title }}</text>
              <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 2px; line-height: 1.625">{{ c.desc }}</text>
            </view>
          </view>
        </view>

        <!-- Partners -->
        <view v-if="!remoteApiEnabled" class="mx-4 mt-4">
          <text class="block" :style="partnerTitleStyle">{{ t.developer.partners }}</text>
          <view class="rounded-2xl grid" :style="partnerGridStyle">
            <view v-for="p in PARTNERS" :key="p.id" class="grid place-items-center" :style="partnerCellStyle">
              <text style="font-size: 12px; color: var(--v5-ink-3); font-weight: 500">{{ p.label }}</text>
            </view>
          </view>
        </view>

        <!-- Request access form -->
        <view class="mx-4 mt-4 mb-6 rounded-2xl" :style="formCardStyle">
          <view class="flex items-center" style="gap: 8px; margin-bottom: 4px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></svg>
            <text style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ t.developer.requestAccess }}</text>
          </view>
          <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-bottom: 12px">{{ t.developer.requestAccessHint }}</text>
          <view v-if="remoteApiEnabled && latestRequest" class="rounded-xl" :style="requestStatusStyle">
            <text class="block font-mono-tabular" style="font-size: 12px; color: var(--v5-tech-cyan)">{{ latestRequest.requestNo }} · {{ latestRequest.status }}</text>
            <text class="block" style="font-size: 12px; color: var(--v5-ink-3); margin-top: 4px">{{ new Date(latestRequest.submittedAt).toLocaleString(dateLocale()) }}</text>
          </view>
          <view v-if="remoteApiEnabled && latestLoadFailed" class="rounded-xl" :style="requestStatusStyle">
            <text class="block" style="font-size: 12px; color: var(--v5-warning)">{{ t.developer.latestLoadFailed }}</text>
            <view role="button" tabindex="0" style="min-height: 44px; display: grid; place-items: center; margin-top: 6px" @click="loadLatestRequest"><text>{{ t.network.retry }}</text></view>
          </view>
          <view class="space-y-2">
            <input v-model="company" :placeholder="t.developer.formCompany" :style="formInputStyle" placeholder-class="nx-dev-ph" />
            <input v-model="email" type="email" :placeholder="t.developer.formEmail" :style="formInputStyle" placeholder-class="nx-dev-ph" />
            <textarea v-model="useCase" :placeholder="t.developer.formUseCasePlaceholder" :style="formTextareaStyle" placeholder-class="nx-dev-ph" />
          </view>
          <view class="mt-3 rounded-xl flex items-center justify-center active:opacity-85" :style="submitBtnStyle" @click="submitRequest">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
            <text style="font-size: 13px; font-weight: 600; color: var(--v5-on-brand)">{{ submitting ? "…" : t.developer.formSubmit }}</text>
          </view>
        </view>
      </template>

      <!-- Docs -->
      <view v-else-if="tab === 'docs'" class="mx-4 mt-3 mb-6">
        <view class="rounded-2xl" :style="formCardStyle">
          <view class="flex items-center" style="gap: 8px; margin-bottom: 8px">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--v5-tech-cyan)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14" /><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></svg>
            <text style="font-size: 13px; font-weight: 600; color: var(--v5-ink)">{{ t.developer.docsPreview }}</text>
          </view>
          <scroll-view scroll-x :style="snippetWrapStyle">
            <text class="font-mono-tabular" :style="snippetTextStyle">{{ API_SNIPPET }}</text>
          </scroll-view>
          <view class="mt-3 rounded-lg" :style="docsComingStyle">
            <text style="font-size: 12px; color: color-mix(in srgb, var(--v5-warning) 90%, transparent)">{{ t.developer.docsTabComing }}</text>
          </view>
        </view>
      </view>

      <!-- API keys -->
      <view v-else-if="tab === 'keys'" class="mx-4 mt-3 mb-6">
        <view class="rounded-2xl text-center" :style="emptyTabStyle">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" /><path d="m21 2-9.6 9.6" /><circle cx="7.5" cy="15.5" r="5.5" /></svg>
          <text class="block" style="font-size: 13px; color: var(--v5-ink-2); margin-top: 12px">{{ t.developer.keysEmpty }}</text>
          <view class="mt-4 inline-flex rounded-xl active:opacity-85" :style="smallBtnStyle" @click="tab = 'overview'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" /><path d="m21 2-9.6 9.6" /><circle cx="7.5" cy="15.5" r="5.5" /></svg>
            <text style="font-size: 13px; font-weight: 600; color: var(--v5-on-brand)">{{ t.developer.keysCreate }}</text>
          </view>
        </view>
      </view>

      <!-- Webhooks -->
      <view v-else class="mx-4 mt-3 mb-6">
        <view class="rounded-2xl text-center" :style="emptyTabStyle">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-4)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin: 0 auto"><path d="M18 8A6 6 0 1 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          <text class="block" style="font-size: 13px; color: var(--v5-ink-2); margin-top: 12px">{{ t.developer.webhooksEmpty }}</text>
          <view class="mt-4 inline-flex rounded-xl active:opacity-85" :style="smallBtnStyle" @click="tab = 'overview'">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--v5-on-brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px"><path d="M18 16.98h-5.99c-1.66 0-3.01-1.34-3.01-3s1.34-3 3.01-3H18" /><path d="m21 12-3-3 3-3" /><path d="M3 12a9 9 0 0 0 9 9" /></svg>
            <text style="font-size: 13px; font-weight: 600; color: var(--v5-on-brand)">{{ t.developer.webhooksAdd }}</text>
          </view>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, type CSSProperties } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { useT } from "@/i18n/use-t";
import { dateLocale } from "@/i18n/format";
import { toast } from "@/store/ui";
import { developerAccessApi, remoteApiEnabled } from "@/api/runtime";
import type { DeveloperAccessReceipt } from "@/api/developer-access-api";
import { useApp } from "@/store/app";
import { readAccountRow, writeAccountRow } from "@/store/account-scoped-storage";

type Tab = "overview" | "docs" | "keys" | "webhooks";

const t = useT();
const app = useApp();
const tab = ref<Tab>("overview");
const company = ref("");
const email = ref("");
const useCase = ref("");
const submitting = ref(false);
const latestRequest = ref<DeveloperAccessReceipt | null>(null);
const latestLoadFailed = ref(false);
const REQUEST_KEY_STORAGE = "nexgrid-developer-access-command-v1";
let requestKey: string | null = null;
let requestGeneration = 0;

const tabOptions = computed(() => [
  { value: "overview" as Tab, label: t.value.developer.apiOverviewTab },
  { value: "docs" as Tab, label: t.value.developer.docsTab },
  { value: "keys" as Tab, label: t.value.developer.keysTab },
  { value: "webhooks" as Tab, label: t.value.developer.webhooksTab },
]);

const PARTNERS = [
  { id: "aws", label: "AWS" },
  { id: "gcp", label: "Google Cloud" },
  { id: "az", label: "Azure" },
  { id: "tf", label: "Terraform" },
  { id: "k8s", label: "Kubernetes" },
  { id: "grafana", label: "Grafana" },
  { id: "slack", label: "Slack" },
  { id: "pd", label: "PagerDuty" },
];

const API_SNIPPET = `POST /v1/inference/dispatch HTTP/1.1
Host: api.nexgrid.ai
Authorization: Bearer <YOUR_API_KEY>
Content-Type: application/json
X-NexGrid-Signature: t=1747432411,v1=2fae...

{
  "model": "flux-1.dev",
  "input": {
    "prompt": "neon cyberpunk city",
    "steps": 30
  },
  "max_tokens": 2048,
  "webhook": "https://your.app/cb"
}

→ 200 OK
{
  "job_id": "ig_2026A78214",
  "status": "queued",
  "eta_seconds": 4,
  "node": "sg-pool-09"
}`;

// API cards — lucide icons inlined as path/rect/ellipse/line arrays.
interface ApiCardDef {
  title: string;
  desc: string;
  color: string;
  icon: string[];
  rects?: Array<{ x: number; y: number; w: number; h: number; rx: number }>;
  ellipses?: Array<{ cx: number; cy: number; rx: number; ry: number }>;
  lines?: Array<{ x1: number; y1: number; x2: number; y2: number }>;
}
const apiCards: ApiCardDef[] = [
  {
    title: t.value.developer.apiCompute,
    desc: t.value.developer.apiComputeD,
    color: "var(--v5-brand)",
    icon: ["M6 12h.01", "M6 16h.01"],
    rects: [{ x: 2, y: 2, w: 20, h: 8, rx: 2 }, { x: 2, y: 14, w: 20, h: 8, rx: 2 }],
  },
  {
    title: t.value.developer.apiEarnings,
    desc: t.value.developer.apiEarningsD,
    color: "var(--v5-warning)",
    icon: ["M3 5V19A9 3 0 0 0 21 19V5", "M3 12A9 3 0 0 0 21 12"],
    ellipses: [{ cx: 12, cy: 5, rx: 9, ry: 3 }],
  },
  {
    title: t.value.developer.apiMarket,
    desc: t.value.developer.apiMarketD,
    color: "var(--v5-tech-cyan)",
    icon: ["M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"],
  },
  {
    title: t.value.developer.apiWebhooks,
    desc: t.value.developer.apiWebhooksD,
    color: "var(--v5-tech-cyan)",
    icon: ["M18 16.98h-5.99c-1.66 0-3.01-1.34-3.01-3s1.34-3 3.01-3H18", "m21 12-3-3 3-3", "M3 12a9 9 0 0 0 9 9"],
  },
];

function newRequestKey(): string { return globalThis.crypto?.randomUUID?.() ?? `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function restoreRequestKey(accountKey: string): string | null {
  const row = readAccountRow<{ key?: string }>(REQUEST_KEY_STORAGE, accountKey);
  return typeof row?.key === "string" && row.key.trim() ? row.key.trim() : null;
}
function persistRequestKey(accountKey: string, key: string | null): void {
  writeAccountRow(REQUEST_KEY_STORAGE, accountKey, key ? { key } : {});
}
async function submitRequest() {
  if (submitting.value) return;
  if (!company.value.trim() || !email.value.trim() || !useCase.value.trim()) {
    toast.warn(t.value.developer.formRequiredToast);
    return;
  }
  if (remoteApiEnabled) {
    const accountKey = String(app.accountKey);
    if (latestRequest.value?.status === "PENDING") {
      toast.info(t.value.developer.pendingExists);
      return;
    }
    const generation = ++requestGeneration;
    submitting.value = true; requestKey ??= restoreRequestKey(accountKey) ?? newRequestKey();
    persistRequestKey(accountKey, requestKey);
    try {
      const submitted = await developerAccessApi.submit({ company: company.value.trim(), email: email.value.trim(), useCase: useCase.value.trim() }, requestKey);
      if (generation !== requestGeneration || accountKey !== String(app.accountKey)) return;
      latestRequest.value = submitted;
      requestKey = null; persistRequestKey(accountKey, null); toast.success(t.value.developer.formSubmittedToast);
      company.value = ""; email.value = ""; useCase.value = "";
    } catch {
      try {
        const latest = await developerAccessApi.latest();
        if (generation !== requestGeneration || accountKey !== String(app.accountKey)) return;
        if (latest && latest.idempotencyKey === requestKey) { latestRequest.value = latest; requestKey = null; persistRequestKey(accountKey, null); toast.success(t.value.developer.formSubmittedToast); }
        else toast.warn(t.value.developer.requestAccessHint);
      } catch {
        if (generation === requestGeneration && accountKey === String(app.accountKey)) toast.warn(t.value.developer.requestAccessHint);
      }
    } finally {
      if (generation === requestGeneration && accountKey === String(app.accountKey)) submitting.value = false;
    }
    return;
  }
  toast.success(t.value.developer.formSubmittedToast);
  company.value = "";
  email.value = "";
  useCase.value = "";
}
function loadLatestRequest() {
  if (!remoteApiEnabled) return;
  const accountKey = String(app.accountKey);
  const generation = ++requestGeneration;
  latestLoadFailed.value = false;
  requestKey = restoreRequestKey(accountKey);
  void developerAccessApi.latest().then((value) => {
    if (generation === requestGeneration && accountKey === String(app.accountKey)) {
      latestRequest.value = value;
      latestLoadFailed.value = false;
      if (requestKey && value?.idempotencyKey === requestKey) {
        requestKey = null;
        persistRequestKey(accountKey, null);
      }
    }
  }).catch(() => {
    if (generation === requestGeneration && accountKey === String(app.accountKey)) latestLoadFailed.value = true;
  });
}
onMounted(loadLatestRequest);
onUnmounted(() => { requestGeneration += 1; });
watch(() => String(app.accountKey), () => {
  requestGeneration += 1;
  requestKey = null;
  submitting.value = false;
  latestRequest.value = null;
  latestLoadFailed.value = false;
  loadLatestRequest();
});

// ── styles ──
const heroStyle: CSSProperties = {
  background:
    "radial-gradient(120% 90% at 0% 0%, color-mix(in srgb, var(--v5-tech-cyan) 15%, transparent) 0%, transparent 55%)," +
    "radial-gradient(100% 80% at 100% 100%, color-mix(in srgb, var(--v5-brand) 10%, transparent) 0%, transparent 60%)," +
    "var(--v5-surface)",
  borderColor: "var(--v5-border)",
  padding: "20px",
};
const heroIconBoxStyle: CSSProperties = {
  top: "12px",
  right: "12px",
  width: "40px",
  height: "40px",
  borderRadius: "12px",
  background: "color-mix(in srgb, var(--v5-tech-cyan) 15%, transparent)",
};
const heroTaglineStyle: CSSProperties = {
  fontSize: "20px",
  fontWeight: 600,
  color: "var(--v5-ink)",
  marginTop: "4px",
  maxWidth: "270px",
  lineHeight: 1.375,
};
const badgeStyle: CSSProperties = {
  fontSize: "12px",
  padding: "2px 8px",
  borderRadius: "999px",
  background: "color-mix(in srgb, var(--v5-ink) 5%, transparent)",
  color: "var(--v5-ink-2)",
};
const segWrapStyle: CSSProperties = {
  // 轨道贴页面底:surface-2 与页面底同色不可辨(亮色 ΔE 2.2),改 L1 surface;选中 pill 是 tech-cyan 实底,不撞色
  background: "var(--v5-surface)",
  borderRadius: "16px",
  padding: "4px",
  gap: "2px",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
};
function pillStyle(v: Tab): CSSProperties {
  const on = tab.value === v;
  return {
    height: "44px",
    borderRadius: "10px",
    background: on ? "var(--v5-tech-cyan)" : "transparent",
  };
}
function pillLabelStyle(v: Tab): CSSProperties {
  const on = tab.value === v;
  return {
    fontFamily: "var(--font-v5)",
    fontSize: "13px",
    fontWeight: 500,
    letterSpacing: "-0.005em",
    color: on ? "var(--v5-on-brand)" : "var(--v5-ink-3)",
  };
}
// De-carded: the 4 API cards merge into a transparent hairline list (rows carry
// their own dividers, last = none) instead of 4 stacked bordered cards.
const apiListStyle: CSSProperties = {
  padding: "0 2px",
  borderTop: "1px solid var(--v5-border)",
};
function apiRowStyle(last: boolean): CSSProperties {
  return {
    padding: "14px 0",
    gap: "12px",
    borderBottom: last ? "none" : "1px solid var(--v5-border)",
  };
}
function apiIconBoxStyle(color: string): CSSProperties {
  return {
    width: "40px",
    height: "40px",
    borderRadius: "12px",
    // 原版 `${color}1A` hex-alpha = 0x1A/0xFF ≈ 10%
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
  };
}
const partnerTitleStyle: CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--v5-ink-3)",
  letterSpacing: "-0.025em",
  padding: "12px 8px 4px",
};
const partnerGridStyle: CSSProperties = {
  background: "var(--v5-surface)",
  padding: "16px",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: "12px",
};
const partnerCellStyle: CSSProperties = {
  aspectRatio: "3 / 2",
  background: "var(--v5-surface-2)",
  borderRadius: "8px",
};
const formCardStyle: CSSProperties = {
  background: "var(--v5-surface)",
  padding: "16px",
};
const formInputStyle: CSSProperties = {
  width: "100%",
  background: "var(--v5-surface-2)",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "13px",
  color: "var(--v5-ink)",
  boxSizing: "border-box",
};
const formTextareaStyle: CSSProperties = {
  width: "100%",
  height: "72px",
  background: "var(--v5-surface-2)",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "13px",
  color: "var(--v5-ink)",
  boxSizing: "border-box",
};
const submitBtnStyle: CSSProperties = {
  height: "48px",
  background: "var(--v5-tech-cyan)",
};
const requestStatusStyle: CSSProperties = { padding: "10px 12px", marginBottom: "12px", background: "var(--v5-surface-2)" };
const snippetWrapStyle: CSSProperties = {
  background: "var(--v5-surface-3)",
  borderRadius: "8px",
  padding: "12px",
  whiteSpace: "nowrap",
};
const snippetTextStyle: CSSProperties = {
  fontSize: "12px",
  color: "var(--v5-success)",
  lineHeight: 1.625,
  whiteSpace: "pre",
};
const docsComingStyle: CSSProperties = {
  padding: "8px 12px",
  background: "color-mix(in srgb, var(--v5-warning) 8%, transparent)",
  border: "1px solid color-mix(in srgb, var(--v5-warning) 25%, transparent)",
};
// White-list empty state: dashed border-strong, no fill.
const emptyTabStyle: CSSProperties = {
  padding: "32px",
  border: "1px dashed var(--v5-border-strong)",
  background: "transparent",
};
const smallBtnStyle: CSSProperties = {
  height: "36px",
  padding: "0 16px",
  background: "var(--v5-tech-cyan)",
  alignItems: "center",
};
</script>

<style scoped>
.nx-dev-ph {
  color: var(--v5-ink-4);
}
</style>
