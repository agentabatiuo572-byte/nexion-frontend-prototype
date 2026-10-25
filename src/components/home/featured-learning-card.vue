<template>
  <view v-if="courses.length" class="learning-card active:opacity-70" role="link" tabindex="0" @click="open" @keydown.enter.prevent="onKeyboardActivate($event)">
    <text class="block" style="font-size:12px;color:var(--v5-brand)">{{ t.learning.featuredLabel }}</text>
    <template v-if="featuredCourse">
      <text class="block learning-title" style="margin-top:8px;font-size:15px;font-weight:600">{{ featuredCourse.title }}</text>
      <text class="block learning-meta">{{ courseMeta }}</text>
      <view v-if="featuredCourse.progress > 0" class="learning-progress" role="progressbar" :aria-label="copy.progress.replace('{progress}', String(featuredCourse.progress))" :aria-valuenow="featuredCourse.progress" :aria-valuemin="0" :aria-valuemax="100">
        <view class="learning-progress-fill" :style="{ width: `${featuredCourse.progress}%` }" />
      </view>
      <view class="learning-footer">
        <text v-if="featuredCourse.progress > 0" class="learning-progress-label">{{ copy.progress.replace('{progress}', String(featuredCourse.progress)) }}</text>
        <text class="learning-action">{{ featuredCourse.progress > 0 ? copy.resume : copy.start }} <text aria-hidden="true">›</text></text>
      </view>
    </template>
    <template v-else>
      <text class="block learning-title" style="margin-top:8px;font-size:15px;font-weight:600">{{ copy.completed }}</text>
      <text class="block learning-meta">{{ copy.completedHint }}</text>
      <view class="learning-footer"><text class="learning-action">{{ copy.review }} <text aria-hidden="true">›</text></text></view>
    </template>
  </view>
</template>
<script setup lang="ts">
import { formatAmount } from "@/lib/amount-display";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onShow, onHide } from "@/composables/use-tab-page-lifecycle";
import { learningApi } from "@/api/learning-runtime";
import { remoteApiEnabled } from "@/api/runtime";
import { captureRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import type { LearningCourse } from "@/api/learning-api";
import { useApp } from "@/store/app";
import { useLocaleStore } from "@/store/locale";
import { navTo } from "@/lib/route";
import { useT } from "@/i18n/use-t";
import { courseDurationText } from "@/lib/course-duration";
import { selectRecommendedCourse } from "@/lib/learning-recommendation";
import { learningRecommendationCopy } from "@/i18n/learning-recommendation";
import { fmt } from "@/i18n/format";
const t = useT();
const app = useApp();
const locale = useLocaleStore();
const courses = ref<LearningCourse[]>([]);
const featuredCourse = computed(() => selectRecommendedCourse(courses.value));
const language = computed(() => locale.code === "en" || locale.code === "vi" ? locale.code : "zh");
const copy = computed(() => learningRecommendationCopy[language.value]);
const courseMeta = computed(() => featuredCourse.value ? fmt(t.value.learning.courseMeta, {
  duration: courseDurationText(featuredCourse.value.duration, t.value.learning.durationMinutes),
  nex: formatAmount(featuredCourse.value.rewardNex),
}) : "");
let visible = false;
let generation = 0;
async function refresh() {
  const ownGeneration = ++generation;
  courses.value = [];
  if (!remoteApiEnabled || !visible) return;
  const scope = `${app.accountKey}:${app.accountBindingEpoch}:${language.value}:${captureRuntimeRevision().epoch}`;
  try {
    const response = await learningApi.courses(language.value);
    if (visible && ownGeneration === generation && scope === `${app.accountKey}:${app.accountBindingEpoch}:${language.value}:${captureRuntimeRevision().epoch}`) courses.value = response.courses;
  } catch { /* Optional recommendation stays hidden when authority is unavailable. */ }
}
function open() {
  if (!courses.value.length) return;
  navTo(featuredCourse.value ? `/pages/learn/course?id=${encodeURIComponent(featuredCourse.value.id)}&source=missions` : "/pages/learn/courses");
}
function onKeyboardActivate(event: KeyboardEvent) { if (!event.repeat) open(); }
function show() { visible = true; void refresh(); }
function hide() { visible = false; generation += 1; courses.value = []; }
onMounted(show);
onShow(show);
onHide(hide);
const unsubscribeRuntime = subscribeRuntimeRevision(() => { void refresh(); });
onUnmounted(() => { hide(); unsubscribeRuntime(); });
watch(() => [app.accountKey, app.accountBindingEpoch, language.value], () => { void refresh(); });
</script>
<style scoped>
.learning-card { padding: 20px; border-radius: 22px; background: var(--v5-surface); color: var(--v5-ink); }
.learning-title, .learning-meta { overflow-wrap:anywhere; }
.learning-meta { margin-top:6px; font-size:12px; line-height:1.5; color:var(--v5-ink-3); }
.learning-progress { margin-top:14px; height:4px; border-radius:4px; overflow:hidden; background:var(--v5-brand-soft); }
.learning-progress-fill { height:100%; border-radius:4px; background:var(--v5-brand); }
.learning-footer { display:flex; align-items:center; justify-content:flex-end; flex-wrap:wrap; gap:8px 12px; margin-top:12px; }
.learning-progress-label { margin-right:auto; font-size:12px; color:var(--v5-ink-3); }
.learning-action { font-size:12px; font-weight:600; color:var(--v5-brand); }
</style>
