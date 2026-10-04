<template>
  <view v-if="featuredCourse" role="link" tabindex="0" style="padding:16px;border-radius:16px;background:var(--v5-surface)" @click="open" @keydown.enter.prevent="open">
    <text class="block" style="font-size:12px;color:var(--v5-brand)">{{ t.learning.featuredLabel }}</text>
    <text class="block" style="margin-top:6px;font-size:15px;font-weight:600">{{ featuredCourse.title }}</text>
    <text class="block" style="margin-top:4px;color:var(--v5-ink-3)">{{ courseDurationText(featuredCourse.duration, t.learning.durationMinutes) }} · {{ featuredCourse.rewardNex }} NEX</text> <!-- i18n-raw-ok: courseDurationText 内部已用 {n} 完成替换 -->
  </view>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import { learningApi } from "@/api/learning-runtime";
import { remoteApiEnabled } from "@/api/runtime";
import { captureRuntimeRevision } from "@/api/order-api";
import type { LearningCourse } from "@/api/learning-api";
import { useApp } from "@/store/app";
import { useLocaleStore } from "@/store/locale";
import { navTo } from "@/lib/route";
import { useT } from "@/i18n/use-t";
import { courseDurationText } from "@/lib/course-duration";
const t = useT();
const app = useApp();
const locale = useLocaleStore();
const courses = ref<LearningCourse[]>([]);
const featuredCourse = computed(() => courses.value.find((course) => course.featured));
const language = computed(() => ["zh", "vi", "en"].includes(locale.code) ? locale.code : "zh");
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
function open() { if (featuredCourse.value) navTo(`/pages/learn/course?id=${encodeURIComponent(featuredCourse.value.id)}`); }
function show() { visible = true; void refresh(); }
function hide() { visible = false; generation += 1; courses.value = []; }
onMounted(show);
onShow(show);
onHide(hide);
onUnmounted(hide);
watch(() => [app.accountKey, app.accountBindingEpoch, language.value], () => { void refresh(); });
</script>
