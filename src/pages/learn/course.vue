<template>
  <AppChassis active="me">
    <view class="px-4" style="padding-bottom: 24px">
      <SubPageHeader :back="courseBack" />
      <view v-if="loading"><text>{{ t.learning.courseLoading }}</text></view>
      <view v-else-if="error" role="alert" aria-live="assertive">
        <text class="block" style="text-wrap: pretty">{{ errorText }}</text>
        <text v-if="error === 'courseIdMissing'" class="block active:opacity-70" style="margin-top: 12px; color: var(--v5-brand)" role="button" tabindex="0" :aria-label="t.learning.centerTitle" @click="backToCourses" @keydown.enter.prevent="onKeyboardActivate($event, backToCourses)" @keydown.space.prevent="onKeyboardActivate($event, backToCourses)">{{ t.learning.centerTitle }}</text>
        <text v-else class="block active:opacity-70" style="margin-top: 12px; color: var(--v5-brand)" role="button" tabindex="0" :aria-label="t.ui.retry" @click="load" @keydown.enter.prevent="onKeyboardActivate($event, load)" @keydown.space.prevent="onKeyboardActivate($event, load)">{{ t.ui.retry }}</text>
      </view>
      <view v-else-if="course">
        <text class="block" style="font-size: 20px; font-weight: 600">{{ course.title }}</text>
        <text class="block" style="margin-top: 10px; color: var(--v5-ink-2); text-wrap: pretty">{{ course.body }}</text>
        <text class="block" style="margin-top: 8px; color: var(--v5-ink-3)">{{ versionLine }}</text>
        <text v-if="startState === 'pending'" class="block" style="margin-top: 8px; color: var(--v5-ink-3); text-wrap: pretty" role="status" aria-live="polite">{{ t.learning.courseStartConfirming }}</text>
        <text v-else-if="startState === 'unconfirmed'" class="block active:opacity-70" style="margin-top: 8px; color: var(--v5-ink-3); text-wrap: pretty" role="alert" aria-live="assertive" tabindex="0" :aria-label="t.learning.courseStartUnconfirmed" @click="load" @keydown.enter.prevent="onKeyboardActivate($event, load)" @keydown.space.prevent="onKeyboardActivate($event, load)">{{ t.learning.courseStartUnconfirmed }}</text>

        <view v-for="(question, index) in course.questions" :key="question.questionId" style="margin-top: 16px">
          <text>{{ question.question }}</text>
          <!-- 每题只能选一个答案(选第二个会把第一个取消),是单选不是多选。
               原先 role="button" + aria-pressed 被浏览器当成 toggle button,读屏按复选框朗读,
               而且没有题目级分组名 —— 用户既以为能多选,也听不出这几个选项属于哪道题。
               改用 radiogroup(组名 = 题干)+ radio + aria-checked。 -->
          <view role="radiogroup" :aria-label="question.question" :data-course-question-index="index">
            <view v-for="(option, optionIndex) in question.options" :key="option" :class="interactionLocked ? '' : 'active:opacity-70'" style="margin-top: 8px" role="radio" :tabindex="!interactionLocked && (answers[index] === optionIndex || (answers[index] === undefined && optionIndex === 0)) ? 0 : -1" :aria-label="option" :aria-checked="answers[index] === optionIndex ? 'true' : 'false'" :aria-disabled="interactionLocked ? 'true' : 'false'" @click="selectAnswer(index, optionIndex)" @keydown.enter.prevent="onKeyboardActivate($event, () => selectAnswer(index, optionIndex))" @keydown.space.prevent="onKeyboardActivate($event, () => selectAnswer(index, optionIndex))" @keydown.up.prevent="moveAnswer(index, optionIndex, -1)" @keydown.down.prevent="moveAnswer(index, optionIndex, 1)">
              <text>{{ answers[index] === optionIndex ? "●" : "○" }} {{ option }}</text>
            </view>
          </view>
        </view>

        <text
          class="block"
          :class="canSubmit ? 'active:opacity-70' : ''"
          :style="{ marginTop: '20px', color: canSubmit ? 'var(--v5-brand)' : 'var(--v5-ink-4)' }"
          role="button"
          :tabindex="canSubmit ? 0 : -1"
          :aria-label="course.questions.length ? t.learning.submitQuiz : t.learning.completeCourse"
          :aria-disabled="canSubmit ? 'false' : 'true'"
          @click="finish"
          @keydown.enter.prevent="onKeyboardActivate($event, finish)"
          @keydown.space.prevent="onKeyboardActivate($event, finish)"
        >{{ course.questions.length ? t.learning.submitQuiz : t.learning.completeCourse }}</text>
        <text v-if="course.questions.length && !pendingAttempt && !allAnswered && !serverCompleted" class="block" style="margin-top: 6px; font-size: 12px; color: var(--v5-ink-3)">{{ t.learning.answerAllFirst }}</text>
        <text v-if="pendingAttempt" class="block active:opacity-70" style="margin-top: 6px; font-size: 12px; color: var(--v5-ink-3); text-wrap: pretty" role="button" tabindex="0" :aria-label="pendingStatusText" @click="load" @keydown.enter.prevent="onKeyboardActivate($event, load)" @keydown.space.prevent="onKeyboardActivate($event, load)">{{ pendingStatusText }}</text>
        <text v-if="resultDetails" data-testid="learning-result-details" class="block tabular-nums" style="margin-top: 12px; color: var(--v5-ink-2); text-wrap: pretty">{{ resultDetails.passed ? t.learning.resultPassed : t.learning.resultFailed }} · {{ scoreLine }} · {{ attemptsLine }} · {{ rewardStatusLine }}</text>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { onHide, onLoad, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import {
  currentPendingLearningAttempt,
  finishPendingLearningAttempt,
  pendingLearningAttempt,
  type LearningAttemptIdentity,
  type LearningPendingAttempt,
} from "@/api/learning-attempt-key";
import { learningApi } from "@/api/learning-runtime";
import { remoteApiEnabled } from "@/api/runtime";
import { captureRuntimeRevision } from "@/api/order-api";
import type { LearningCourse, LearningQuizReceiptStatus, LearningResult } from "@/api/learning-api";
import { ApiError } from "@/api/errors";
import { navReplace, takeNavigationQuery } from "@/lib/route";
import { preserveCourseSourceInH5, resolveCourseNavigation } from "./course-navigation";
import { fmt } from "@/i18n/format";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { useApp } from "@/store/app";
import { bindPageVisibilityRefresh, createPageVisibilityRefresh } from "@/lib/page-visibility-refresh";
import { createLearningPageFenceReader, type LearningPageFence } from "./learning-page-fence";
import { createLearningCourseStartLoadCoalescer, loadPublishedCourseWithStart } from "./learning-course-start";
import { learningAttemptRecoveryAction, learningResultDetails, matchingCourseResult, matchingReceiptResult, validAnswersForCourse } from "./learning-result-details";

// 存 key 不存译文：译好的串快照进 ref 后不再跟随语言（见 courses.vue 同处注释）。
type CourseError = "" | "courseOffline" | "courseIdMissing" | "courseUnavailable" | "courseUpdated" | "submitUnconfirmed";
type CourseStartState = "idle" | "pending" | "confirmed" | "unconfirmed";

const t = useT();
const locale = useLocaleStore();
const app = useApp();
const courseId = ref("");
const courseBack = ref("/pages/learn/courses");
const courseSource = ref<string | null>(null);
const course = ref<LearningCourse | null>(null);
const result = ref<LearningResult | null>(null);
const answers = ref<number[]>([]);
const pendingAttempt = ref<LearningPendingAttempt | null>(null);
const pendingReceiptStatus = ref<LearningQuizReceiptStatus | null>(null);
const startState = ref<CourseStartState>("idle");
const loading = ref(true);
const error = ref<CourseError>("");

const errorText = computed(() => error.value ? t.value.learning[error.value] : "");
const allAnswered = computed(() => !!course.value
  && answers.value.length === course.value.questions.length
  && answers.value.every((answer) => answer >= 0));
const resultDetails = computed(() => learningResultDetails(course.value, result.value));
const serverCompleted = computed(() => !!course.value?.completed || !!result.value?.completed);
const pendingAnswersValid = computed(() => !!course.value
  && !!pendingAttempt.value
  && validAnswersForCourse(course.value, pendingAttempt.value.answers));
const startConfirmed = computed(() => startState.value === "confirmed");
const interactionLocked = computed(() => !startConfirmed.value || !!pendingAttempt.value);
// 失败结果允许重新作答；已通过的服务端结果才禁止重复提交。
const canSubmit = computed(() => !!course.value
  && !loading.value
  && startConfirmed.value
  && !serverCompleted.value
  && (!course.value.questions.length || (pendingAttempt.value
    ? pendingAnswersValid.value && ["ABSENT", "FAILED"].includes(String(pendingReceiptStatus.value))
    : allAnswered.value)));
const language = computed(() => ["zh", "vi", "en"].includes(locale.code) ? locale.code : "zh");
const versionLine = computed(() => course.value
  ? fmt(t.value.learning.courseVersionMeta, { version: course.value.version, nex: course.value.rewardNex })
  : "");
const scoreLine = computed(() => resultDetails.value
  ? fmt(t.value.learning.resultScore, { score: resultDetails.value.score })
  : "");
const attemptsLine = computed(() => resultDetails.value
  ? fmt(t.value.learning.resultAttempts, { attempts: resultDetails.value.attempts })
  : "");
const rewardStatusLine = computed(() => {
  const details = resultDetails.value;
  if (!details) return "";
  if (details.rewardGranted) return fmt(t.value.learning.rewardGranted, { nex: details.rewardNex });
  return Number(details.rewardNex) > 0 ? t.value.learning.rewardNotGranted : t.value.learning.rewardNone;
});
const pendingStatusText = computed(() => pendingReceiptStatus.value === "UNKNOWN"
  ? t.value.learning.submissionResultUnknown
  : t.value.learning.pendingSubmission);

let accountEpoch = 0;
let generation = 0;
let mounted = false;
const fenceReader = createLearningPageFenceReader(
  () => String(app.accountKey),
  () => accountEpoch,
  captureRuntimeRevision,
  () => generation,
  () => mounted,
  () => courseId.value,
);

function fence(): LearningPageFence { return fenceReader.capture(); }
function current(scope: LearningPageFence): boolean { return fenceReader.isCurrent(scope); }
function onKeyboardActivate(event: KeyboardEvent, action: () => void) { if (!event.repeat) action(); }
function backToCourses() { void navReplace("/pages/learn/courses"); }
function attemptIdentity(expectedCourse: LearningCourse): LearningAttemptIdentity | null {
  const accountKey = String(app.accountKey).trim();
  if (!accountKey) return null;
  return { accountKey, courseId: expectedCourse.id, version: expectedCourse.version };
}
function selectAnswer(questionIndex: number, optionIndex: number) {
  if (loading.value || interactionLocked.value) return;
  answers.value[questionIndex] = optionIndex;
}
/** 上下方向键移一格并选上,焦点跟到新选中项(与 theme-row.vue 的左右键同形)。 */
function moveAnswer(questionIndex: number, optionIndex: number, delta: number) {
  const options = course.value?.questions[questionIndex]?.options ?? [];
  if (options.length === 0) return;
  const next = (optionIndex + delta + options.length) % options.length;
  selectAnswer(questionIndex, next);
  void nextTick(() => {
    if (typeof document === "undefined") return;
    document.querySelector<HTMLElement>(`[data-course-question-index="${questionIndex}"] [role="radio"][aria-checked="true"]`)?.focus();
  });
}
function isCourseVersionConflict(cause: unknown): boolean {
  return cause instanceof ApiError && cause.message === "LEARNING_COURSE_VERSION_CONFLICT";
}
function retireAttempt(identity: LearningAttemptIdentity | null, attemptKey: string) {
  if (identity) finishPendingLearningAttempt(identity, attemptKey);
  pendingAttempt.value = null;
  pendingReceiptStatus.value = null;
}

async function recoverPendingReceipt(scope: LearningPageFence, expectedCourse: LearningCourse): Promise<boolean> {
  const identity = attemptIdentity(expectedCourse);
  if (!identity) return false;
  const pending = currentPendingLearningAttempt(identity);
  if (!pending) return false;
  pendingAttempt.value = pending;
  if (validAnswersForCourse(expectedCourse, pending.answers)) answers.value = [...pending.answers!];
  try {
    const receipt = await learningApi.quizReceipt(expectedCourse.id, expectedCourse.version, pending.key);
    if (!current(scope)) return false;
    pendingReceiptStatus.value = receipt.status;
    const action = learningAttemptRecoveryAction(pending, receipt.status);
    const recovered = matchingReceiptResult(expectedCourse, receipt);
    if (action === "RESTORE") {
      if (!recovered) {
        pendingReceiptStatus.value = "UNKNOWN";
        return false;
      }
      result.value = recovered;
      retireAttempt(identity, pending.key);
      return true;
    }
    if (action === "RETIRE" || (action === "REPLAY" && !validAnswersForCourse(expectedCourse, pending.answers))) {
      retireAttempt(identity, pending.key);
    }
    return false;
  } catch {
    // Older backend versions cannot distinguish an absent receipt from an
    // in-flight request. Hold the original key until a later refresh resolves it.
    pendingReceiptStatus.value = "UNKNOWN";
    return false;
  }
}

async function performLoad() {
  generation += 1;
  const scope = fence();
  const requestedCourseId = courseId.value;
  loading.value = true;
  error.value = "";
  course.value = null;
  result.value = null;
  pendingAttempt.value = null;
  pendingReceiptStatus.value = null;
  startState.value = "idle";
  // 🔴 zentao #240:缺课程 ID 与「没有网络」是两件事,此前共用一条分支 ——
  //   深链没带 courseId(或参数丢失)时报的是「课程需要在受信任网络中获取」,
  //   把用户引向检查网络这个错误方向,而真正该做的是从教程中心重新进入。
  if (!requestedCourseId.trim()) {
    if (!current(scope)) return;
    loading.value = false;
    error.value = "courseIdMissing";
    return;
  }
  if (!remoteApiEnabled) {
    if (!current(scope)) return;
    loading.value = false;
    error.value = "courseOffline";
    return;
  }
  try {
    const loaded = await loadPublishedCourseWithStart({
      courseId: requestedCourseId,
      language: language.value,
      read: learningApi.course,
      start: learningApi.start,
      isCurrent: () => current(scope),
      publish: (published, start) => {
        if (!current(scope)) return;
        course.value = published;
        answers.value = Array(published.questions.length).fill(-1);
        startState.value = start;
        loading.value = false;
      },
    });
    if (loaded.kind === "stale" || !current(scope)) return;
    if (loaded.kind === "invalid") {
      error.value = "courseUnavailable";
      return;
    }
    startState.value = loaded.start;
    if (startConfirmed.value) await recoverPendingReceipt(scope, loaded.course);
  } catch (cause) {
    if (current(scope)) error.value = cause instanceof ApiError && cause.kind === "network" ? "courseOffline" : "courseUnavailable";
  } finally {
    if (current(scope)) loading.value = false;
  }
}

let startLoad = createLearningCourseStartLoadCoalescer(performLoad);
function load(): Promise<void> { return startLoad(); }
function resetLoadCoalescer() { startLoad = createLearningCourseStartLoadCoalescer(performLoad); }

// 回读服务端课程快照。completed、lastScore、attempts、rewardGranted 都是当前
// API 契约中的权威字段；不再把刷新后的结果降级成笼统的“已完成”。
async function recoverAuthoritative(scope: LearningPageFence, expectedCourse: LearningCourse): Promise<boolean> {
  const fresh = await learningApi.course(expectedCourse.id, language.value);
  if (!current(scope)) return false;
  course.value = fresh;
  return fresh.completed || fresh.attempts > expectedCourse.attempts;
}

function acceptResult(
  scope: LearningPageFence,
  expectedCourse: LearningCourse,
  identity: LearningAttemptIdentity | null,
  attemptKey: string,
  submitted: LearningResult,
): boolean {
  if (!current(scope)) return false;
  const accepted = matchingCourseResult(expectedCourse, submitted);
  if (!accepted) return false;
  result.value = accepted;
  retireAttempt(identity, attemptKey);
  return true;
}

async function finish() {
  if (!course.value || loading.value || !startConfirmed.value || !canSubmit.value) return;
  const scope = fence();
  const submittedCourse = course.value;
  let submittedAnswers = [...answers.value];
  const identity = attemptIdentity(submittedCourse);
  let attemptKey = `learning-quiz:${submittedCourse.id}:${submittedCourse.version}:${Date.now().toString(36)}`;
  if (submittedCourse.questions.length && identity) {
    const pending = pendingAttempt.value ?? pendingLearningAttempt(identity, submittedAnswers);
    if (!pending.answers) {
      pendingReceiptStatus.value = "UNKNOWN";
      return;
    }
    pendingAttempt.value = pending;
    pendingReceiptStatus.value = pendingReceiptStatus.value ?? "ABSENT";
    attemptKey = pending.key;
    submittedAnswers = [...pending.answers];
  }
  loading.value = true;
  error.value = "";
  try {
    const submitted = submittedCourse.questions.length
      ? await learningApi.submitQuiz(submittedCourse.id, submittedCourse.version, submittedAnswers, attemptKey)
      : await learningApi.complete(submittedCourse.id, submittedCourse.version);
    if (!acceptResult(scope, submittedCourse, identity, attemptKey, submitted)) throw new Error("LEARNING_RESULT_SCOPE_MISMATCH");
  } catch (cause) {
    if (!current(scope)) return;
    if (isCourseVersionConflict(cause)) {
      retireAttempt(identity, attemptKey);
      error.value = "courseUpdated";
      return;
    }
    if (submittedCourse.questions.length) {
      try {
        const receipt = await learningApi.quizReceipt(submittedCourse.id, submittedCourse.version, attemptKey);
        if (!current(scope)) return;
        pendingReceiptStatus.value = receipt.status;
        const recovered = matchingReceiptResult(submittedCourse, receipt);
        if (recovered && acceptResult(scope, submittedCourse, identity, attemptKey, recovered)) return;
        const action = learningAttemptRecoveryAction(
          pendingAttempt.value ?? { key: attemptKey, answers: submittedAnswers },
          receipt.status,
        );
        if (action === "HOLD" || action === "RESTORE") return;
        if (action === "RETIRE") {
          retireAttempt(identity, attemptKey);
          return;
        }

        // ABSENT/FAILED proves there is no committed in-flight result. Replaying
        // the immutable body with the same key cannot create a second attempt.
        const replay = await learningApi.submitQuiz(submittedCourse.id, submittedCourse.version, submittedAnswers, attemptKey);
        if (acceptResult(scope, submittedCourse, identity, attemptKey, replay)) return;
        throw new Error("LEARNING_RESULT_SCOPE_MISMATCH");
      } catch (recoveryCause) {
        if (isCourseVersionConflict(recoveryCause)) {
          retireAttempt(identity, attemptKey);
          error.value = "courseUpdated";
          return;
        }
        try {
          if (await recoverAuthoritative(scope, submittedCourse)) {
            retireAttempt(identity, attemptKey);
            return;
          }
        } catch { /* Preserve the unresolved attempt below. */ }
        pendingReceiptStatus.value = "UNKNOWN";
        return;
      }
    }
    try {
      if (await recoverAuthoritative(scope, submittedCourse)) return;
    } catch {
      if (current(scope)) error.value = "submitUnconfirmed";
    }
  } finally {
    if (current(scope)) loading.value = false;
  }
}

function resetCourseState() {
  course.value = null;
  result.value = null;
  answers.value = [];
  pendingAttempt.value = null;
  pendingReceiptStatus.value = null;
  startState.value = "idle";
  error.value = "";
}
function refreshForScopeChange() {
  accountEpoch += 1;
  generation += 1;
  resetLoadCoalescer();
  resetCourseState();
  if (mounted) void load();
}
onLoad((options) => {
  const { id: nextCourseId, source, back } = resolveCourseNavigation(options, takeNavigationQuery("/pages/learn/course"));
  courseBack.value = back;
  courseSource.value = source;
  if (courseId.value === nextCourseId) return;
  courseId.value = nextCourseId;
  generation += 1;
  resetLoadCoalescer();
  resetCourseState();
  if (mounted) void load();
});
const courseVisibility = createPageVisibilityRefresh(() => { void load(); });
bindPageVisibilityRefresh(courseVisibility, {
  mounted: (callback) => onMounted(() => { mounted = true; callback(); }),
  shown: (callback) => onShow(() => {
    mounted = true;
    preserveCourseSourceInH5(courseId.value, courseSource.value);
    callback();
  }),
  hidden: (callback) => onHide(() => {
    mounted = false;
    generation += 1;
    resetLoadCoalescer();
    resetCourseState();
    callback();
  }),
});
onUnmounted(() => { mounted = false; generation += 1; resetLoadCoalescer(); });
watch(() => String(app.accountKey), refreshForScopeChange);
watch(() => app.accountBindingEpoch, refreshForScopeChange);
watch(() => language.value, refreshForScopeChange);
</script>
