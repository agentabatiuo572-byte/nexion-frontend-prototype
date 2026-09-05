<template>
  <AppChassis active="home">
    <view class="entry-page" :class="toneClass" :data-entry-surface="surface">
      <view class="entry-hero">
        <view class="entry-copy">
          <view class="entry-kicker">
            <text>{{ data.kicker }}</text>
          </view>
          <text class="entry-title">{{ data.title }}</text>
          <text class="entry-body">{{ data.body }}</text>
          <view class="entry-actions">
            <view class="entry-action entry-action--primary" role="button" tabindex="0" :aria-label="data.primary.label" @click="go(data.primary.href)">
              <text>{{ data.primary.label }}</text>
            </view>
            <view class="entry-action entry-action--ghost" role="button" tabindex="0" :aria-label="data.secondary.label" @click="go(data.secondary.href)">
              <text>{{ data.secondary.label }}</text>
            </view>
          </view>
        </view>

        <view class="entry-visual" aria-hidden="true">
          <svg class="entry-visual-svg" viewBox="0 0 236 236" fill="none">
            <rect x="52" y="18" width="132" height="200" rx="26" fill="var(--v5-surface)" stroke="var(--v5-border-strong)" stroke-width="2" />
            <rect x="68" y="44" width="100" height="148" rx="10" fill="var(--v5-bg)" stroke="var(--v5-border)" />
            <circle cx="118" cy="205" r="6" fill="var(--v5-surface-3)" />
            <path d="M86 84h64" stroke="var(--v5-brand)" stroke-width="7" stroke-linecap="round" />
            <path d="M86 108h44" stroke="var(--v5-brand-2)" stroke-width="7" stroke-linecap="round" />
            <path d="M86 132h76" stroke="var(--v5-tech-cyan)" stroke-width="7" stroke-linecap="round" />
            <path d="M86 156h52" stroke="var(--v5-ink-4)" stroke-width="7" stroke-linecap="round" />
            <circle cx="176" cy="64" r="22" fill="var(--v5-brand-soft)" stroke="var(--v5-brand-border)" />
            <path :d="data.iconPath" stroke="var(--v5-brand)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </view>
      </view>

      <view class="entry-mode">
        <text class="entry-mode-label">{{ data.modeLabel }}</text>
        <text class="entry-mode-value">{{ data.modeValue }}</text>
      </view>

      <view class="entry-grid">
        <view v-for="metric in data.metrics" :key="metric.label" class="entry-metric">
          <text class="entry-metric-value">{{ metric.value }}</text>
          <text class="entry-metric-label">{{ metric.label }}</text>
        </view>
      </view>

      <view class="entry-flow">
        <view v-for="step in data.steps" :key="step.title" class="entry-step">
          <view class="entry-step-dot" />
          <view class="entry-step-copy">
            <text class="entry-step-title">{{ step.title }}</text>
            <text class="entry-step-body">{{ step.body }}</text>
          </view>
        </view>
      </view>

      <view class="entry-link" role="button" tabindex="0" :aria-label="t.entrySurface.fullLinks" @click="go('/pages/entry-surfaces/index')">
        <text>{{ t.entrySurface.fullLinks }}</text>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 17 17 7" />
          <path d="M8 7h9v9" />
        </svg>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";

type SurfaceKey = "signed" | "h5" | "white";

const props = defineProps<{ surface: SurfaceKey }>();
const t = useT();

// 文案在 i18n(entrySurface.surfaces.*);这里只留跟语言无关的东西:
// 目的地路由 + hero 插画的 SVG path。
const SHELLS: Record<SurfaceKey, { primaryHref: string; secondaryHref: string; iconPath: string }> = {
  signed: {
    primaryHref: "/",
    secondaryHref: "/pages/me/devices",
    iconPath: "M169 64h14M176 57v14M160 83c7 5 25 5 32 0",
  },
  h5: {
    primaryHref: "/pages/earn/earn",
    secondaryHref: "/pages/me/devices",
    iconPath: "M161 55h31v23h-31zM169 86h15M176 78v8",
  },
  white: {
    primaryHref: "/",
    secondaryHref: "/pages/me/security",
    iconPath: "M160 64c6-10 26-10 32 0M165 78h22M176 50v42",
  },
};

const shell = computed(() => SHELLS[props.surface]);
const copy = computed(() => t.value.entrySurface.surfaces[props.surface]);
const data = computed(() => {
  const c = copy.value;
  return {
    kicker: c.kicker,
    title: c.title,
    body: c.body,
    modeLabel: c.modeLabel,
    modeValue: c.modeValue,
    primary: { label: c.primaryLabel, href: shell.value.primaryHref },
    secondary: { label: c.secondaryLabel, href: shell.value.secondaryHref },
    metrics: [c.metrics.a, c.metrics.b, c.metrics.c],
    steps: [c.steps.a, c.steps.b, c.steps.c],
    iconPath: shell.value.iconPath,
  };
});
const toneClass = computed(() => `entry-page--${props.surface}`);

function go(href: string) {
  navTo(href);
}
</script>

<style scoped>
.entry-page {
  min-height: 100%;
  padding: 0 16px 16px;
  /* chassis-nav 页(useSetPageHeader,无 SubPageHeader):全局 24px 顶距不生效,此处单一 padding-top 作 nav→content 呼吸单源 */
  padding-top: 24px;
  color: var(--v5-ink);
  font-family: var(--font-v5);
  background: var(--v5-bg);
}

.entry-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
  min-height: 430px;
  padding: 0 0 10px;
}

.entry-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
}

.entry-kicker {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--v5-surface);
  color: var(--v5-ink-2);
  font-size: 12px;
  font-weight: 600;
}

.entry-title {
  display: block;
  margin-top: 18px;
  color: var(--v5-ink);
  font-size: 34px;
  font-weight: 600;
  line-height: 1.04;
  overflow-wrap: anywhere;
}

.entry-body {
  display: block;
  margin-top: 14px;
  max-width: 560px;
  color: var(--v5-ink-2);
  font-size: 13px;
  line-height: 1.65;
}

.entry-actions {
  display: grid;
  width: 100%;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 22px;
}

.entry-action {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.entry-action:active {
  opacity: 0.7;
}

.entry-action--primary {
  background: var(--v5-brand);
  color: var(--v5-on-brand);
}

.entry-action--ghost {
  background: var(--v5-surface);
  color: var(--v5-ink);
}

.entry-visual {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 238px;
  border-radius: 8px;
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--v5-surface) 82%, transparent), color-mix(in srgb, var(--v5-surface-2) 68%, transparent)),
    var(--v5-surface);
  box-shadow: var(--v5-card-shadow-lift);
}

.entry-visual-svg {
  width: min(236px, 100%);
  height: auto;
}

.entry-mode {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
  padding: 12px;
  border-radius: 8px;
  background: var(--v5-surface);
}

.entry-mode-label {
  color: var(--v5-ink-3);
  font-size: 12px;
  font-weight: 600;
}

.entry-mode-value {
  color: var(--v5-brand);
  font-size: 15px;
  font-weight: 600;
}

.entry-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 10px;
}

.entry-metric {
  min-width: 0;
  min-height: 82px;
  padding: 12px 10px;
  border-radius: 8px;
  background: var(--v5-surface);
}

.entry-metric-value {
  display: block;
  color: var(--v5-ink);
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.entry-metric-label {
  display: block;
  margin-top: 6px;
  color: var(--v5-ink-3);
  font-size: 12px;
  line-height: 1.35;
}

.entry-flow {
  margin-top: 12px;
  border-radius: 16px;
  background: var(--v5-surface);
}

.entry-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-height: 64px;
  padding: 13px 14px;
}

.entry-step:not(:last-child) {
  border-bottom: 1px solid var(--v5-border);
}

.entry-step-dot {
  width: 9px;
  height: 9px;
  margin-top: 6px;
  border-radius: 999px;
  background: var(--v5-brand-2);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--v5-brand-2) 16%, transparent);
}

.entry-step-copy {
  min-width: 0;
}

.entry-step-title {
  display: block;
  color: var(--v5-ink);
  font-size: 13px;
  font-weight: 600;
}

.entry-step-body {
  display: block;
  margin-top: 4px;
  color: var(--v5-ink-2);
  font-size: 12px;
  line-height: 1.6;
}

.entry-link {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  margin-top: 12px;
  padding: 0 14px;
  border-radius: 8px;
  /* 可点链接行直接坐在 entry-page 底(--v5-bg)上,surface-2 与页面底同色不可辨 → 改 L1 surface,与同级 entry-mode / entry-metric 对齐 */
  background: var(--v5-surface);
  color: var(--v5-ink-2);
  font-size: 13px;
  font-weight: 600;
}

.entry-link:active {
  opacity: 0.7;
}

@media (min-width: 700px) {
  .entry-page {
    padding: 24px;
  }

  .entry-hero {
    grid-template-columns: minmax(0, 1.12fr) minmax(260px, 0.88fr);
    align-items: center;
    min-height: 370px;
  }

  .entry-actions {
    max-width: 430px;
    grid-template-columns: 1fr 1fr;
  }

  .entry-title {
    font-size: 56px;
  }
}
</style>
