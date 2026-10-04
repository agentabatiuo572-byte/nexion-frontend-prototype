<template>
  <AppChassis active="me"><view class="px-4" style="padding-bottom:24px"><SubPageHeader back="/pages/me/me" />
    <view v-if="loading"><text>{{ t.learning.centerLoading }}</text></view>
    <view v-else-if="error" role="alert" aria-live="assertive"><text class="block" style="text-wrap:pretty">{{ errorText }}</text><text class="block active:opacity-70" style="margin-top:12px;color:var(--v5-brand)" role="button" tabindex="0" @click="load"  @keydown.enter.prevent="onKeyboardActivate($event, load)" @keydown.space.prevent="onKeyboardActivate($event, load)">{{ t.ui.retry }}</text></view>
    <view v-else><text class="block" style="font-size:20px;font-weight:600">{{ t.learning.centerTitle }}</text><text class="block" style="margin:8px 0;color:var(--v5-ink-3)">{{ progressLine }}</text>
      <EmptyState v-if="overview?.courses.length === 0" kind="empty-list" :title="t.empty.listTitle" :desc="t.empty.listDesc" compact />
      <view v-if="featuredCourse" role="link" tabindex="0" style="margin:12px 0;padding:16px;border:1px solid var(--v5-brand);border-radius:12px" @click="open(featuredCourse.id)" @keydown.enter.prevent="onKeyboardActivate($event, () => featuredCourse && open(featuredCourse.id))">
        <text class="block" style="color:var(--v5-brand)">{{ t.learning.featuredLabel }}</text>
        <text class="block" style="font-weight:600">{{ featuredCourse?.title }}</text>
        <text class="block">{{ courseMeta(featuredCourse) }}</text>
      </view>
      <view v-for="course in overview?.courses" :key="course.id" class="nx-glass-card active:opacity-70" style="margin-top:10px;padding:14px" role="link" tabindex="0" @click="open(course.id)" @keydown.enter.prevent="onKeyboardActivate($event, () => open(course.id))"><text class="block" style="font-weight:600">{{ course.title }}</text><text class="block" style="margin-top:5px;color:var(--v5-ink-3)">{{ courseMeta(course) }}</text></view>
    </view>
  </view></AppChassis>
</template>
<script setup lang="ts">
import { navTo } from "@/lib/route";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { onHide, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import EmptyState from "@/components/empty-state.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { learningApi } from "@/api/learning-runtime";
import { remoteApiEnabled } from "@/api/runtime";
import { fmt } from "@/i18n/format";
import { courseDurationText } from "@/lib/course-duration";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { useApp } from "@/store/app";
import { captureRuntimeRevision } from "@/api/order-api";
import { createLearningPageFenceReader, type LearningPageFence } from "./learning-page-fence";
import { bindPageVisibilityRefresh, createPageVisibilityRefresh } from "@/lib/page-visibility-refresh";
import type { LearningCourse, LearningOverview } from "@/api/learning-api";
// 存 key 而不是译好的串:译文一旦快照进 ref 就不再跟随语言(uni 复用页面实例时,
// 上一次访问用的语言会留在错误提示上 —— 实景走查实测:zh 下重试按钮是中文、正文还是英文)。
type LearningError = "" | "centerOffline" | "centerGeoUnresolved" | "centerUnavailable";
const t = useT(); const locale = useLocaleStore(); const app = useApp(); const overview = ref<LearningOverview | null>(null); const loading = ref(true); const error = ref<LearningError>("");
const errorText = computed(() => error.value ? t.value.learning[error.value] : "");
const featuredCourse = computed(() => overview.value?.courses.find((course) => course.featured));
const language = computed(() => ["zh", "vi", "en"].includes(locale.code) ? locale.code : "zh");
const progressLine = computed(() => fmt(t.value.learning.centerProgress, { done: overview.value?.completedCourses ?? 0, total: overview.value?.totalCourses ?? 0, nex: overview.value?.earnedNex ?? 0 }));
function courseMeta(course: LearningCourse) { return fmt(t.value.learning.courseMeta, { duration: courseDurationText(course.duration, t.value.learning.durationMinutes), nex: course.rewardNex }); }
function onKeyboardActivate(event: KeyboardEvent, action: () => void) { if (!event.repeat) action(); }
let accountEpoch = 0;
let generation = 0;
let mounted = false;
const fenceReader = createLearningPageFenceReader(
  () => String(app.accountKey),
  () => accountEpoch,
  captureRuntimeRevision,
  () => generation,
  () => mounted,
);
function fence(): LearningPageFence { return fenceReader.capture(); }
function current(scope: LearningPageFence): boolean { return fenceReader.isCurrent(scope); }
async function load() {
  const scope = fence();
  loading.value = true;
  overview.value = null;
  error.value = "";
  if (!remoteApiEnabled) {
    if (!current(scope)) return;
    loading.value = false;
    error.value = "centerOffline";
    return;
  }
  try {
    const value = await learningApi.courses(language.value);
    if (current(scope)) overview.value = value;
  } catch (cause) {
    if (current(scope)) error.value = cause instanceof Error && cause.message.includes("GEO_COUNTRY_UNRESOLVED") ? "centerGeoUnresolved" : "centerUnavailable";
  } finally {
    if (current(scope)) loading.value = false;
  }
}
function open(id: string) { navTo(`/pages/learn/course?id=${encodeURIComponent(id)}`); }
const courseVisibility = createPageVisibilityRefresh((reason) => {
  if (reason === "return") generation += 1;
  void load();
});
bindPageVisibilityRefresh(courseVisibility, {
  mounted: (callback) => onMounted(() => {
    mounted = true;
    callback();
  }),
  shown: (callback) => onShow(() => {
    mounted = true;
    callback();
  }),
  hidden: (callback) => onHide(() => {
    mounted = false;
    generation += 1;
    callback();
  }),
});
onUnmounted(() => { mounted = false; generation += 1; });
function refreshForScopeChange() {
  accountEpoch += 1;
  generation += 1;
  overview.value = null;
  error.value = "";
  if (mounted) void load();
}
watch(() => String(app.accountKey), refreshForScopeChange);
watch(() => app.accountBindingEpoch, refreshForScopeChange);
watch(() => language.value, refreshForScopeChange);


</script>
