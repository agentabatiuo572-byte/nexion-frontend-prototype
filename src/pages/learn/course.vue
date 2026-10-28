<template>
  <AppChassis active="me">
    <view class="learning-course">
      <view v-if="displayCourse && displayCompleted && !error" class="course-result-header">
        <view class="course-result-header__close nx-design-glass" role="button" tabindex="0" :aria-label="auditCopy.close" @click="navBack(courseBack)" @keydown.enter.prevent="navBack(courseBack)" @keydown.space.prevent="navBack(courseBack)">
          <LiquidGlass :radius="22" tone="navigation" />
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </view>
        <text class="course-result-header__title">{{ displayCourse.title }}</text>
      </view>
      <SubPageHeader v-else design :back="courseBack" :title="displayCourse?.title" />
      <view v-if="loading && !displayCourse" class="course-state" role="status"><text>{{ t.learning.courseLoading }}</text></view>
      <view v-else-if="error" class="course-state" role="alert" aria-live="assertive">
        <text class="block" style="text-wrap: pretty">{{ errorText }}</text>
        <text v-if="error === 'courseIdMissing'" class="block active:opacity-70" style="margin-top: 12px; color: var(--v5-brand)" role="button" tabindex="0" :aria-label="t.learning.centerTitle" @click="backToCourses" @keydown.enter.prevent="onKeyboardActivate($event, backToCourses)" @keydown.space.prevent="onKeyboardActivate($event, backToCourses)">{{ t.learning.centerTitle }}</text>
        <text v-else class="block active:opacity-70" style="margin-top: 12px; min-height: 44px; font: 600 13px/20px var(--font-v5); color: var(--v5-brand)" role="button" tabindex="0" :aria-label="t.ui.retry" @click="load" @keydown.enter.prevent="onKeyboardActivate($event, load)" @keydown.space.prevent="onKeyboardActivate($event, load)">{{ t.ui.retry }}</text>
      </view>
      <view v-else-if="displayCourse && displayCompleted" class="course-completed">
        <view class="course-result" role="status" aria-live="polite">
          <view class="course-result__badge" aria-hidden="true"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10" /></svg></view>
          <text class="course-result__title">{{ displayCourse.questions.length ? completionCopy.quizPassed : t.learning.resultPassed }}</text>
          <text data-testid="learning-result-details" class="course-result__summary" :aria-label="[completionSummary, attemptsLine, rewardStatusLine].filter(Boolean).join(' · ')">{{ completionSummary }}</text>
          <text v-if="displayResultDetails" class="course-result__reward" :class="{ 'course-result__reward--pending': !displayResultDetails.rewardGranted }">{{ completionReward }}</text>
        </view>
        <view class="course-next-section">
          <view v-if="recommendedNext" class="course-next">
            <text class="course-next__label">{{ auditCopy.nextCourse }}</text>
            <text class="course-next__title">{{ recommendedNext.title }}</text>
            <view class="course-next__meta"><text>{{ nextCourseMeta }} · {{ completionCopy.reward }} </text><text class="course-next__reward">{{ formatAmount(recommendedNext.rewardNex) }} UVT</text></view>
            <NxButton data-testid="learning-next-course" class="course-next__cta" variant="primary" :label="completionCopy.startNext" @click="openNextCourse" />
          </view>
          <view v-else-if="nextLoading" class="course-next-state" role="status"><text>{{ completionCopy.nextLoading }}</text></view>
          <view v-else-if="nextError" class="course-next-state nx-inline-recovery" role="alert">
            <text class="nx-inline-recovery__copy">{{ completionCopy.nextUnavailable }}</text>
            <NxButton class="nx-inline-recovery__action" variant="text" :label="t.ui.retry" @click="loadNextCourses" />
          </view>
          <view v-else-if="nextOverview" class="course-next-state"><text>{{ auditCopy.allCoursesDone }}</text><text class="course-next__reward">{{ fmt(auditCopy.earned, { n: formatAmount(nextOverview.earnedNex) }) }}</text></view>
          <NxButton class="course-result__back" variant="text" :label="completionCopy.backToCenter" @click="backToCourses" />
        </view>
      </view>
      <view v-else-if="displayCourse" class="course-lesson">
        <text class="block" style="font-size: var(--ui-type-page-title); line-height: var(--ui-type-page-title-lh); font-weight: 600">{{ displayCourse.title }}</text>
        <view class="course-read-progress" role="progressbar" :aria-valuenow="displayCompleted ? 100 : displayCourse.progress" aria-valuemin="0" aria-valuemax="100"><view :style="{width:(displayCompleted ? 100 : displayCourse.progress)+'%'}" /></view>
        <text class="block" style="margin-top: 10px; color: var(--v5-ink-2); text-wrap: pretty">{{ displayCourse.body }}</text>
        <text class="block" style="margin-top: 8px; color: var(--v5-ink-3); font-size: var(--ui-type-list-subtitle)">{{ versionLine }}</text>
        <text v-if="startState === 'pending' && !warmCourseRead" class="block" style="margin-top: 8px; color: var(--v5-ink-3); text-wrap: pretty" role="status" aria-live="polite">{{ t.learning.courseStartConfirming }}</text>
        <view v-else-if="startState === 'unconfirmed'" style="margin-top: 8px">
          <text class="block" style="color: var(--v5-ink-3); text-wrap: pretty" role="alert" aria-live="assertive">{{ startFailureText }}</text>
          <NxButton data-testid="learning-start-recovery" style="margin-top: 8px" variant="secondary" :label="startRecoveryLabel" @click="recoverStart" />
        </view>

        <view v-for="(question, index) in displayCourse.questions" :key="question.questionId" style="margin-top: 16px">
          <text>{{ question.question }}</text>
          <!-- 每题只能选一个答案(选第二个会把第一个取消),是单选不是多选。
               原先 role="button" + aria-pressed 被浏览器当成 toggle button,读屏按复选框朗读,
               而且没有题目级分组名 —— 用户既以为能多选,也听不出这几个选项属于哪道题。
               改用 radiogroup(组名 = 题干)+ radio + aria-checked。 -->
          <view role="radiogroup" :aria-label="question.question" :data-course-question-index="index">
            <view v-for="(option, optionIndex) in question.options" :key="option" :class="interactionLocked ? '' : 'active:opacity-70'" style="margin-top: 8px" role="radio" :tabindex="quizOptionTabIndex(answers[index], optionIndex, question.options.length, interactionLocked || loading)" :aria-label="option" :aria-checked="answers[index] === optionIndex ? 'true' : 'false'" :aria-disabled="interactionLocked ? 'true' : 'false'" @click="selectAnswer(index, optionIndex)" @keydown.enter.prevent="onKeyboardActivate($event, () => selectAnswer(index, optionIndex))" @keydown.space.prevent="onKeyboardActivate($event, () => selectAnswer(index, optionIndex))" @keydown.up.prevent="moveAnswer(index, optionIndex, -1)" @keydown.down.prevent="moveAnswer(index, optionIndex, 1)">
              <view class="course-radio" :class="{selected: answers[index] === optionIndex}" aria-hidden="true" /><text>{{ option }}</text>
            </view>
          </view>
        </view>

        <NxButton class="course-submit" v-if="!displayResultDetails || displayResultDetails.passed" style="margin-top:20px" variant="primary" :disabled="!canSubmit" :label="displayCourse.questions.length ? t.learning.submitQuiz : t.learning.completeCourse" @click="finish" />
        <text v-if="displayCourse.questions.length && !pendingAttempt && !allAnswered && !displayCompleted" class="block" style="margin-top: 6px; font-size: 12px; color: var(--v5-ink-3)">{{ t.learning.answerAllFirst }}</text>
        <text v-if="pendingAttempt" class="block active:opacity-70" style="margin-top: 6px; font-size: 12px; color: var(--v5-ink-3); text-wrap: pretty" role="button" tabindex="0" :aria-label="pendingStatusText" @click="load" @keydown.enter.prevent="onKeyboardActivate($event, load)" @keydown.space.prevent="onKeyboardActivate($event, load)">{{ pendingStatusText }}</text>
        <view v-if="displayResultDetails" data-testid="learning-result-details" class="course-quiz-result" role="status"><text class="course-quiz-result__title">{{ displayResultDetails.passed ? t.learning.resultPassed : t.learning.resultFailed }}</text><text class="course-quiz-result__score">{{ scoreLine }}</text><text class="course-quiz-result__meta">{{ attemptsLine }} · {{ rewardStatusLine }}</text>
          <NxButton v-if="!displayResultDetails.passed && !interactionLocked" class="course-quiz-result__retry" variant="primary" :label="retryQuizLabel" @click="restartQuiz" />
        </view>
      </view>
    </view>
  </AppChassis>
</template>

<script setup lang="ts">
import NxButton from "@/components/ui/nx-button.vue";
import { useAuditUiCopy } from "@/i18n/audit-ui";
import { selectRecommendedCourse } from "@/lib/learning-recommendation";
import type { LearningOverview } from "@/api/learning-api";
import { formatAmount } from "@/lib/amount-display";
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from "vue";
import { onHide, onLoad, onShow } from "@dcloudio/uni-app";
import AppChassis from "@/components/app-chassis.vue";
import LiquidGlass from "@/components/liquid-glass.vue";
import SubPageHeader from "@/components/sub-page-header.vue";
import {
  currentPendingLearningAttempt,
  finishPendingLearningAttempt,
  pendingLearningAttempt,
  type LearningAttemptIdentity,
  type LearningPendingAttempt,
} from "@/api/learning-attempt-key";
import { learningApi } from "@/api/learning-runtime";
import { remoteApiEnabled, apiRuntimeConfig } from "@/api/runtime";
import { captureRuntimeRevision, subscribeRuntimeRevision } from "@/api/order-api";
import type { LearningCourse, LearningQuizReceiptStatus, LearningResult } from "@/api/learning-api";
import { ApiError } from "@/api/errors";
import { navTo, navBack, navReplace, takeNavigationQuery } from "@/lib/route";
import { courseDurationText } from "@/lib/course-duration";
import { preserveCourseSourceInH5, resolveCourseNavigation } from "./course-navigation";
import { fmt } from "@/i18n/format";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { useApp } from "@/store/app";
import { bindPageVisibilityRefresh, createPageVisibilityRefresh } from "@/lib/page-visibility-refresh";
import { createLearningPageFenceReader, type LearningPageFence } from "./learning-page-fence";
import { createLearningCourseStartLoadCoalescer, loadPublishedCourseWithStart, type LearningCourseStartFailure } from "./learning-course-start";
import { observationRecoveryRoute } from "@/lib/day-one-observation-recovery";
import { initialQuizAnswers, quizOptionTabIndex, learningAttemptRecoveryAction, learningResultDetails, matchingCourseResult, matchingReceiptResult, validAnswersForCourse } from "./learning-result-details";

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
const coursePresentation = ref<LearningCourse | null>(null);
const warmCourseRead = ref(false);
const displayCourse = computed(() => course.value ?? coursePresentation.value);
const result = ref<LearningResult | null>(null);
const answeringAgain = ref(false);
// Keep the last acknowledged attempt count when a retake hides the old result.
// An older course readback must not retire a newer unresolved submission.
const confirmedAttempts = ref(0);
const answers = ref<number[]>([]);
const pendingAttempt = ref<LearningPendingAttempt | null>(null);
const pendingReceiptStatus = ref<LearningQuizReceiptStatus | null>(null);
const startState = ref<CourseStartState>("idle");
const startFailure = ref<LearningCourseStartFailure>();
const loading = ref(true);
const error = ref<CourseError>("");

const errorText = computed(() => error.value ? t.value.learning[error.value] : "");
const startFailureText = computed(() => startFailure.value?.reason === "onboarding" ? t.value.learning.courseStartSetup
  : startFailure.value?.reason === "terms" ? t.value.learning.courseStartTerms
  : startFailure.value?.reason === "network" ? t.value.learning.courseStartNetwork : t.value.learning.courseStartUnconfirmed);
const startRecoveryLabel = computed(() => startFailure.value?.reason === "onboarding" ? t.value.home.dayOneObservationSetupAction
  : startFailure.value?.reason === "terms" ? t.value.conversations.contactSupport : t.value.ui.retry);
const allAnswered = computed(() => !!course.value
  && validAnswersForCourse(course.value, answers.value));
const resultDetails = computed(() => answeringAgain.value && !result.value ? null : learningResultDetails(course.value, result.value));
const displayResultDetails = computed(() => answeringAgain.value && !result.value ? null : resultDetails.value ?? learningResultDetails(displayCourse.value, null));
const displayCompleted = computed(() => !!displayCourse.value?.completed || serverCompleted.value);
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
const language = computed(() => locale.code === "zh" || locale.code === "vi" ? locale.code : "en");
const versionLine = computed(() => displayCourse.value
  ? fmt(t.value.learning.courseVersionMeta, { version: displayCourse.value.version, nex: formatAmount(displayCourse.value.rewardNex) })
  : "");
const scoreLine = computed(() => displayResultDetails.value
  ? fmt(t.value.learning.resultScore, { score: displayResultDetails.value.score })
  : "");
const attemptsLine = computed(() => displayResultDetails.value
  ? fmt(t.value.learning.resultAttempts, { attempts: displayResultDetails.value.attempts })
  : "");
const rewardStatusLine = computed(() => {
  const details = displayResultDetails.value;
  if (!details) return "";
  if (details.rewardGranted) return fmt(t.value.learning.rewardGranted, { nex: formatAmount(details.rewardNex) });
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
function backToCourses() {
  try {
    const routes = getCurrentPages().map(page => page.route?.replace(/^\//, ""));
    let center = routes.length - 2;
    while (center >= 0 && routes[center] === "pages/learn/course") center--;
    if (routes[routes.length - 1] === "pages/learn/course" && center >= 0 && routes[center] === "pages/learn/courses") {
      uni.navigateBack({ delta: routes.length - 1 - center, fail: () => { void navReplace("/pages/learn/courses"); } });
      return;
    }
  } catch { /* An unreadable stack keeps the declared learning-center target. */ }
  void navReplace("/pages/learn/courses");
}
function attemptIdentity(expectedCourse: LearningCourse): LearningAttemptIdentity | null {
  const accountKey = String(app.accountKey).trim();
  if (!accountKey) return null;
  return { accountKey, courseId: expectedCourse.id, version: expectedCourse.version };
}
function selectAnswer(questionIndex: number, optionIndex: number) {
  if (loading.value || interactionLocked.value) return;
  const question = course.value?.questions[questionIndex];
  if (!question || !Number.isSafeInteger(optionIndex) || optionIndex < 0 || optionIndex >= question.options.length) return;
  answers.value[questionIndex] = optionIndex;
}
const retryQuizLabel = computed(() => ({zh:'重新作答',en:'Try quiz again',vi:'Làm lại bài kiểm tra'}[language.value]));
function restartQuiz() {
  if (!course.value || interactionLocked.value || loading.value || serverCompleted.value) return;
  answers.value = initialQuizAnswers(course.value);
  result.value = null;
  answeringAgain.value = true;
  const scope = fence();
  void nextTick(() => {
    if (!current(scope) || typeof document === 'undefined') return;
    const first = document.querySelector<HTMLElement>('[data-course-question-index="0"] [role="radio"]');
    first?.scrollIntoView({behavior:'smooth', block:'center'});
    first?.focus({preventScroll:true});
  });
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
      confirmedAttempts.value = Math.max(confirmedAttempts.value, recovered.attempts);
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

let courseEnvironmentInvalidated = false;
watch(() => apiRuntimeConfig?.environment, () => { courseEnvironmentInvalidated = true; generation += 1; coursePresentation.value = null; resetLoadCoalescer(); resetCourseState(); error.value = 'courseUnavailable'; }, { flush: 'sync' });
async function performLoad() {
  if (courseEnvironmentInvalidated) return;
  generation += 1;
  const scope = fence();
  const requestedCourseId = courseId.value;
  warmCourseRead.value = coursePresentation.value !== null;
  loading.value = true;
  error.value = "";
  course.value = null;
  answers.value = [];
  result.value = null;
  answeringAgain.value = false;
  confirmedAttempts.value = 0;
  pendingAttempt.value = null;
  pendingReceiptStatus.value = null;
  startState.value = "idle";
  startFailure.value = undefined;
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
      publish: (published, start, failure) => {
        if (!current(scope)) return;
        if (failure?.status === 401 || failure?.status === 403) {
          course.value = null; coursePresentation.value = null; startState.value = 'unconfirmed';
          startFailure.value = failure; loading.value = false; error.value = 'courseUnavailable'; return;
        }
        course.value = published;
        coursePresentation.value = published;
        confirmedAttempts.value = published.attempts;
        answers.value = initialQuizAnswers(published);
        startState.value = start;
        startFailure.value = failure;
        loading.value = false;
      },
    });
    if (loaded.kind === "stale" || !current(scope)) return;
    if (loaded.kind === "invalid") {
      coursePresentation.value = null;
      error.value = "courseUnavailable";
      return;
    }
    startState.value = loaded.start;
    if (startConfirmed.value) await recoverPendingReceipt(scope, loaded.course);
  } catch (cause) {
    if (current(scope)) { coursePresentation.value = null; error.value = cause instanceof ApiError && cause.kind === "network" ? "courseOffline" : "courseUnavailable"; }
  } finally {
    if (current(scope)) loading.value = false;
  }
}

let startLoad = createLearningCourseStartLoadCoalescer(performLoad);
function load(): Promise<void> { return startLoad(); }
function resetLoadCoalescer() { startLoad = createLearningCourseStartLoadCoalescer(performLoad); }

function recoverStart() {
  if (!mounted || loading.value || startState.value !== "unconfirmed" || !course.value) return;
  const reason = startFailure.value?.reason;
  if (reason === "terms") return navTo("/pages/support/messages");
  if (reason !== "onboarding") return load();
  let web = false;
  // #ifdef H5
  web = true;
  // #endif
  const returnTo = `/pages/learn/course?id=${encodeURIComponent(courseId.value)}${courseSource.value ? `&source=${encodeURIComponent(courseSource.value)}` : ""}`;
  navTo(observationRecoveryRoute(reason, web, returnTo));
}

// 回读服务端课程快照。completed、lastScore、attempts、rewardGranted 都是当前
// API 契约中的权威字段；不再把刷新后的结果降级成笼统的“已完成”。
async function recoverAuthoritative(scope: LearningPageFence, expectedCourse: LearningCourse): Promise<boolean> {
  const fresh = await learningApi.course(expectedCourse.id, language.value);
  if (!current(scope)) return false;
  course.value = fresh;
  const recovered = fresh.completed || fresh.attempts > Math.max(expectedCourse.attempts, confirmedAttempts.value);
  if (recovered) {
    confirmedAttempts.value = fresh.attempts;
    answeringAgain.value = false;
  }
  return recovered;
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
  coursePresentation.value = { ...expectedCourse, completed: accepted.completed,
    progress: accepted.completed ? 100 : expectedCourse.progress, lastScore: accepted.score,
    attempts: accepted.attempts, rewardGranted: accepted.rewardGranted };
  confirmedAttempts.value = Math.max(confirmedAttempts.value, accepted.attempts);
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
    } catch { /* An unavailable readback still leaves the submission unconfirmed. */ }
    if (current(scope)) error.value = "submitUnconfirmed";
  } finally {
    if (current(scope)) loading.value = false;
  }
}

function resetCourseState() {
  course.value = null;
  result.value = null;
  answeringAgain.value = false;
  confirmedAttempts.value = 0;
  answers.value = [];
  pendingAttempt.value = null;
  pendingReceiptStatus.value = null;
  startState.value = "idle";
  startFailure.value = undefined;
  error.value = "";
}
function refreshForScopeChange() {
  coursePresentation.value = null;
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
  coursePresentation.value = null;
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
watch(() => String(app.accountKey), refreshForScopeChange, { flush: "sync" });
watch(() => app.accountBindingEpoch, refreshForScopeChange, { flush: "sync" });
watch(() => language.value, refreshForScopeChange, { flush: "sync" });
const stopRuntimeRefresh = subscribeRuntimeRevision(() => {
  accountEpoch += 1; generation += 1; resetLoadCoalescer(); resetCourseState();
  if (mounted) void load();
});
onUnmounted(stopRuntimeRefresh);

const auditCopy = useAuditUiCopy();
const nextOverview = ref<LearningOverview | null>(null);
const nextLoading = ref(false);
const nextError = ref(false);
const completionCopy = computed(() => ({
  zh: { quizPassed: "测验通过", progress: "已学完 {done}/{total} 课", credited: "+{n} UVT 已到账", questions: "{n} 道小测", reward: "奖励", startNext: "开始下一课", backToCenter: "返回教程中心", nextLoading: "正在读取下一课…", nextUnavailable: "下一课暂不可用，请重试。" },
  en: { quizPassed: "Quiz passed", progress: "{done}/{total} courses completed", credited: "+{n} UVT credited", questions: "{n} quiz questions", reward: "Reward", startNext: "Start next course", backToCenter: "Back to learning center", nextLoading: "Loading next course…", nextUnavailable: "The next course is unavailable. Please retry." },
  vi: { quizPassed: "Đã vượt qua bài kiểm tra", progress: "Đã học {done}/{total} bài", credited: "Đã nhận +{n} UVT", questions: "{n} câu hỏi", reward: "Thưởng", startNext: "Bắt đầu bài tiếp theo", backToCenter: "Về trung tâm học tập", nextLoading: "Đang tải bài tiếp theo…", nextUnavailable: "Chưa tải được bài tiếp theo. Vui lòng thử lại." },
}[language.value]));
const completionSummary = computed(() => {
  const progress = nextOverview.value ? fmt(completionCopy.value.progress, { done: nextOverview.value.completedCourses, total: nextOverview.value.totalCourses }) : "";
  return [displayCourse.value?.questions.length ? scoreLine.value : "", progress].filter(Boolean).join(" · ") || t.value.learning.resultPassed;
});
const completionReward = computed(() => displayResultDetails.value?.rewardGranted
  ? fmt(completionCopy.value.credited, { n: formatAmount(displayResultDetails.value.rewardNex) })
  : rewardStatusLine.value);
const recommendedNext = computed(() => selectRecommendedCourse((nextOverview.value?.courses ?? []).filter(item => item.id !== courseId.value)));
const nextCourseMeta = computed(() => {
  const next = recommendedNext.value;
  if (!next) return "";
  const duration = courseDurationText(next.duration, t.value.learning.durationMinutes);
  return next.questions.length ? duration + " · " + fmt(completionCopy.value.questions, { n: next.questions.length }) : duration;
});
function openNextCourse() {
  const next = recommendedNext.value;
  if (next) navTo(`/pages/learn/course?id=${encodeURIComponent(next.id)}`);
}
let nextRequest = 0;
function resetNextCourses(keepPresentation = false) { nextRequest++; if (!keepPresentation) nextOverview.value = null; nextLoading.value = false; nextError.value = false; }
async function loadNextCourses() {
  resetNextCourses(true);
  if (!serverCompleted.value || !remoteApiEnabled || !mounted) return;
  const request = nextRequest;
  const scope = fence();
  nextLoading.value = true;
  try {
    const next = await learningApi.courses(language.value);
    if (request === nextRequest && current(scope) && serverCompleted.value) nextOverview.value = next;
  } catch {
    if (request === nextRequest && current(scope)) { nextOverview.value = null; nextError.value = true; }
  } finally {
    if (request === nextRequest && current(scope)) nextLoading.value = false;
  }
}
watch(() => [serverCompleted.value, courseId.value, app.accountKey, app.accountBindingEpoch, language.value] as const, () => { void loadNextCourses(); });
watch(() => [courseId.value, app.accountKey, app.accountBindingEpoch, language.value] as const, () => resetNextCourses(), { flush: "sync" });
watch(() => displayCourse.value, value => { if (!value) resetNextCourses(); }, { flush: "sync" });
onHide(() => resetNextCourses(true));
onUnmounted(resetNextCourses);
</script>

<style scoped>
.course-submit.nx-button--disabled { opacity: 1; }
.learning-course { --learning-reward: var(--v5-nex); padding-bottom: var(--v5-space-6); color: var(--v5-ink); font-family: var(--font-v5); }
.learning-course :deep(.spv--design) { grid-template-columns: 56px minmax(0, 1fr) 56px; margin: 0; }
.course-state, .course-lesson { padding: 20px 16px 0; }
.course-result-header { display: grid; grid-template-columns: 56px minmax(0, 1fr) 56px; align-items: center; box-sizing: border-box; height: 56px; padding: 0 6px; }
.course-result-header__close { position: relative; display: grid; place-items: center; width: 44px; height: 44px; margin-left: 6px; border-radius: 50%; color: var(--v5-ink-2); cursor: pointer; }
.course-result-header__close > svg { position: relative; z-index: 1; }
.course-result-header__close:active { opacity: .7; }
.course-result-header__close:focus-visible { outline: 2px solid var(--v5-brand); outline-offset: 2px; }
.course-result-header__title { overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; font-size: 18px; font-weight: 600; line-height: 24px; }
.course-result { display: flex; flex-direction: column; align-items: center; padding: 56px 24px 0; text-align: center; }
.course-result__badge { display: grid; place-items: center; flex: none; width: 84px; height: 84px; border-radius: 50%; color: var(--v5-on-brand); background: linear-gradient(160deg, var(--ui-lime-pale), var(--v5-brand)); box-shadow: 0 0 0 10px color-mix(in srgb, var(--v5-brand) 10%, transparent), 0 0 0 22px color-mix(in srgb, var(--v5-brand) 5%, transparent), 0 14px 40px color-mix(in srgb, var(--v5-brand) 35%, transparent); }
.course-result__title { display: block; margin-top: 18px; font-size: var(--v5-type-h2); font-weight: 600; line-height: 38px; overflow-wrap: anywhere; }
.course-result__summary { display: block; margin-top: 6px; font-size: 13.5px; line-height: 20px; color: var(--v5-ink-3); font-variant-numeric: tabular-nums; text-wrap: pretty; }
.course-result__reward { display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 32px; margin-top: var(--v5-space-4); padding: var(--v5-space-1) 14px; border-radius: var(--v5-radius-full); background: color-mix(in srgb, var(--learning-reward) 16%, transparent); color: var(--learning-reward); font-size: 14px; font-weight: 600; line-height: 24px; font-variant-numeric: tabular-nums; }
.course-result__reward--pending { background: var(--v5-surface); color: var(--v5-ink-3); }
.course-next-section { padding: var(--v5-space-10) var(--v5-space-4) 0; }
.course-next { position: relative; overflow: hidden; padding: 18px; border: 1px solid var(--v5-border); border-radius: var(--ui-radius-surface); background: radial-gradient(60% 70% at 100% 0%, color-mix(in srgb, var(--v5-brand) 16%, transparent), transparent 65%), linear-gradient(180deg, var(--ui-spotlight-top), var(--ui-ticket-bottom)); }
.course-next__label { display: block; font-size: 12.5px; font-weight: 500; line-height: 18px; color: var(--v5-brand); }
.course-next__title { display: block; margin-top: 6px; font-size: 18px; font-weight: 600; line-height: 24px; overflow-wrap: anywhere; }
.course-next__meta { margin-top: 6px; font-size: 12.5px; line-height: 18px; color: var(--v5-ink-3); overflow-wrap: anywhere; }
.course-next__reward { color: var(--learning-reward); font-variant-numeric: tabular-nums; }
.learning-course .course-next__cta { display: flex; box-sizing: border-box; width: 100%; min-height: 48px; margin-top: var(--v5-space-4); padding: 0; font-size: var(--ui-type-button); font-weight: 600; }
.course-quiz-result { display:flex;flex-direction:column;gap:8px;margin-top:20px;padding-top:20px;border-top:1px solid var(--v5-border); }
.course-quiz-result__title { font:600 18px/25px var(--font-v5);color:var(--v5-ink); }
.course-quiz-result__score { font:600 28px/36px var(--font-v5);font-variant-numeric:tabular-nums; }
.course-quiz-result__meta { font:400 var(--ui-type-list-subtitle)/20px var(--font-v5);color:var(--v5-ink-2); }
.course-quiz-result__retry { width:100%;margin-top:8px; }
.course-next-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px; text-align: center; font-size: 13.5px; line-height: 20px; color: var(--v5-ink-3); }
.learning-course .course-result__back { display: flex; box-sizing: border-box; width: 100%; min-height: 44px; margin-top: var(--v5-space-2); padding: var(--v5-space-2) var(--v5-space-3); font-size: 14px; font-weight: 400; color: var(--v5-ink-2); }
.course-next-state.nx-inline-recovery { display: grid; align-items: center; gap: 12px; text-align: start; }
[role="radio"] { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 12px; border: 1px solid var(--v5-border); border-radius: 14px; font: 400 14px/1.5 var(--font-v5); }
[role="radio"][aria-checked="true"] { border-color: var(--v5-brand); background: color-mix(in srgb,var(--v5-brand) 6%,transparent); }
.course-radio { width: 18px; height: 18px; border: 1px solid var(--v5-ink-3); border-radius: 50%; flex: none; }
.course-radio.selected { border: 5px solid var(--v5-brand); }
.course-read-progress { height: 4px; background: var(--v5-surface-3); margin-top:16px;border-radius:4px;overflow:hidden; }.course-read-progress > view { height:100%;background:var(--v5-brand); }
/* Lesson text is running copy: long-form role (14px floor on small screens). */
.learning-course .course-lesson { font-size: var(--ui-type-long-form); line-height: var(--ui-type-long-form-lh); }
</style>
