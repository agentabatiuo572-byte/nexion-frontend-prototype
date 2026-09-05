<template>
  <AppChassis active="home">
    <view class="entry-index" data-entry-surface="index">
      <view class="entry-index__head">
        <text class="entry-index__eyebrow">{{ t.entrySurface.indexEyebrow }}</text>
        <text class="entry-index__title">{{ t.entrySurface.indexTitle }}</text>
        <text class="entry-index__body">{{ t.entrySurface.indexBody }}</text>
      </view>

      <view class="entry-index__list">
        <view v-for="item in links" :key="item.route" class="entry-index__row" role="button" tabindex="0" :aria-label="item.label" @click="open(item.route)">
          <view class="entry-index__row-copy">
            <text class="entry-index__row-label">{{ item.label }}</text>
            <text class="entry-index__row-url">{{ item.fullUrl }}</text>
          </view>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--v5-ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 17 17 7" />
            <path d="M8 7h9v9" />
          </svg>
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import { useSetPageHeader } from "@/composables/use-page-header";
import { useT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";

const t = useT();

// 行标题走 i18n;route 是地址不是文案,不翻。
const LINKS: ReadonlyArray<{ key: keyof typeof t.value.entrySurface.surfaces; route: string }> = [
  { key: "signed", route: "/pages/entry-surfaces/signed" },
  { key: "h5", route: "/pages/entry-surfaces/h5" },
  { key: "white", route: "/pages/entry-surfaces/white?entry=white-app" },
];

// The displayed URL must match wherever the app is actually served — a hardcoded
// origin is wrong on any other port (worktree dev server) or deployed host.
// pathname carries the deploy base path ("/" in dev, "/app/" under a sub-path);
// non-H5 targets have no `window`, so those fall back to the route alone.
const origin = computed(() =>
  typeof window !== "undefined" && window.location
    ? `${window.location.origin}${window.location.pathname}`
    : "",
);

const links = computed(() =>
  LINKS.map((l) => ({
    ...l,
    label: t.value.entrySurface.surfaces[l.key].linkLabel,
    fullUrl: `${origin.value}#${l.route}`,
  })),
);

// getter 形式 —— 切语言时 nav header 跟着变。
useSetPageHeader(() => ({
  title: t.value.entrySurface.indexNavTitle,
  subtitle: t.value.entrySurface.indexNavSubtitle,
  backHref: "/",
}));

function open(route: string) {
  navTo(route);
}
</script>

<style scoped>
.entry-index {
  min-height: 100%;
  padding: 0 16px 16px;
  /* chassis-nav 页(useSetPageHeader,无 SubPageHeader):全局 24px 顶距不生效,此处单一 padding-top 作 nav→content 呼吸单源 */
  padding-top: 24px;
  color: var(--v5-ink);
  font-family: var(--font-v5);
  background: var(--v5-bg);
}

.entry-index__head {
  padding: 0 0 10px;
}

.entry-index__eyebrow {
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

.entry-index__title {
  display: block;
  margin-top: 18px;
  color: var(--v5-ink);
  font-size: 34px;
  font-weight: 600;
  line-height: 1.08;
}

.entry-index__body {
  display: block;
  margin-top: 12px;
  color: var(--v5-ink-2);
  font-size: 13px;
  line-height: 1.65;
}

.entry-index__list {
  margin-top: 18px;
  border-radius: 16px;
  background: var(--v5-surface);
}

.entry-index__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 60px;
  padding: 13px 14px;
}

.entry-index__row:not(:last-child) {
  border-bottom: 1px solid var(--v5-border);
}

.entry-index__row:active {
  opacity: 0.7;
}

.entry-index__row-copy {
  min-width: 0;
}

.entry-index__row-label {
  display: block;
  color: var(--v5-ink);
  font-size: 15px;
  font-weight: 600;
}

.entry-index__row-url {
  display: block;
  margin-top: 7px;
  color: var(--v5-ink-3);
  font-family: var(--font-jet-mono);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

@media (min-width: 700px) {
  .entry-index {
    padding: 24px;
  }

  .entry-index__title {
    font-size: 56px;
  }
}
</style>
