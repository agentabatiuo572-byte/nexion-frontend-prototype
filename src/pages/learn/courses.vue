<template>
  <AppChassis active="me"><view class="px-4" style="padding-bottom:24px"><SubPageHeader back="/pages/me/me" />
    <view v-if="loading"><text>{{ t.learning.centerLoading }}</text></view>
    <view v-else-if="error"><text class="block" style="text-wrap:pretty">{{ errorText }}</text><text class="block active:opacity-70" style="margin-top:12px;color:var(--v5-brand)" @click="load">{{ t.ui.retry }}</text></view>
    <view v-else><text class="block" style="font-size:20px;font-weight:600">{{ t.learning.centerTitle }}</text><text class="block" style="margin:8px 0;color:var(--v5-ink-3)">{{ progressLine }}</text>
      <view v-for="course in overview?.courses" :key="course.id" class="active:opacity-70" style="margin-top:10px;padding:14px;border-radius:12px;background:var(--v5-surface)" @click="open(course.id)"><text class="block" style="font-weight:600">{{ course.title }}</text><text class="block" style="margin-top:5px;color:var(--v5-ink-3)">{{ courseMeta(course) }}</text></view>
    </view>
  </view></AppChassis>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import { learningApi } from "@/api/learning-runtime";
import { remoteApiEnabled } from "@/api/runtime";
import { fmt } from "@/i18n/format";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import type { LearningCourse, LearningOverview } from "@/api/learning-api";
// 存 key 而不是译好的串:译文一旦快照进 ref 就不再跟随语言(uni 复用页面实例时,
// 上一次访问用的语言会留在错误提示上 —— 实景走查实测:zh 下重试按钮是中文、正文还是英文)。
type LearningError = "" | "centerOffline" | "centerGeoUnresolved" | "centerUnavailable";
const t = useT(); const locale = useLocaleStore(); const overview = ref<LearningOverview | null>(null); const loading = ref(true); const error = ref<LearningError>("");
const errorText = computed(() => error.value ? t.value.learning[error.value] : "");
const language = computed(() => ["zh", "vi", "en"].includes(locale.code) ? locale.code : "zh");
const progressLine = computed(() => fmt(t.value.learning.centerProgress, { done: overview.value?.completedCourses ?? 0, total: overview.value?.totalCourses ?? 0, nex: overview.value?.earnedNex ?? 0 }));
function courseMeta(course: LearningCourse) { return fmt(t.value.learning.courseMeta, { duration: course.duration, nex: course.rewardNex }); }
async function load() { loading.value = true; overview.value = null; error.value = ""; if (!remoteApiEnabled) { loading.value = false; error.value = "centerOffline"; return; } try { overview.value = await learningApi.courses(language.value); } catch (cause) { error.value = cause instanceof Error && cause.message.includes("GEO_COUNTRY_UNRESOLVED") ? "centerGeoUnresolved" : "centerUnavailable"; } finally { loading.value = false; } }
function open(id: string) { uni.navigateTo({ url: `/pages/learn/course?id=${encodeURIComponent(id)}` }); }
onMounted(() => { void load(); });
</script>
