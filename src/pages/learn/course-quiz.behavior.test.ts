import ts from 'typescript';
import * as vue from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import source from './course.vue?raw';
import { zh } from '@/i18n/messages/zh';
import { fmt } from '@/i18n/format';
import { formatAmount } from '@/lib/amount-display';
import { courseDurationText } from '@/lib/course-duration';
import { selectRecommendedCourse } from '@/lib/learning-recommendation';
import * as visibility from '@/lib/page-visibility-refresh';
import * as navigation from './course-navigation';
import * as start from './learning-course-start';
import * as details from './learning-result-details';
import { observationRecoveryRoute } from '@/lib/day-one-observation-recovery';
import { createLearningPageFenceReader } from './learning-page-fence';
import { captureRuntimeRevision } from '@/api/order-api';
import { LearningAttemptKeyRegistry } from '@/api/learning-attempt-key';
import { ApiError } from '@/api/errors';
import type { LearningCourse, LearningResult } from '@/api/learning-api';

const quiz: LearningCourse = {
  id: 'course-a', title: 'Quiz', body: 'Lesson', category: 'Basics', format: 'Article', level: 'Beginner',
  duration: '5 min', rewardNex: 8, featured: false, version: 'v2', progress: 0, completed: false,
  attempts: 0, lastScore: 0, rewardGranted: false, serverCanonical: true, source: 'provider',
  sourceEnvironment: 'PRODUCTION', runId: '', permanentLabel: 'PRODUCTION LEARNING FACTS',
  questions: [{ questionId: 'q1', question: 'One', options: ['A', 'B'] }, { questionId: 'q2', question: 'Two', options: ['A', 'B', 'C'] }],
};
const failed: LearningResult = { courseId: quiz.id, version: quiz.version, score: 50, passed: false,
  completed: false, rewardGranted: false, rewardNex: 0, attempts: 1, serverCanonical: true,
  sourceEnvironment: 'PRODUCTION', runId: '' };
const scopes: vue.EffectScope[] = [];
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.unstubAllGlobals(); });

async function mount(published = quiz, web = true) {
  const hooks: Record<string, Array<(...args: any[]) => void>> = { load: [], mounted: [], show: [], hide: [], unmount: [] };
  const app = vue.reactive({ accountKey: 'a', accountBindingEpoch: 1 });
  let saved: unknown;
  const registry = new LearningAttemptKeyRegistry({ read: () => saved, write: value => { saved = structuredClone(value); } });
  const api = {
    course: vi.fn(async () => structuredClone(published)), start: vi.fn(async () => structuredClone(published)),
    submitQuiz: vi.fn(async (..._args: any[]) => ({ ...failed })), complete: vi.fn(), courses: vi.fn(),
    quizReceipt: vi.fn(async (..._args: any[]) => ({ status: 'UNKNOWN', committed: false, result: null })),
  };
  const modules: Record<string, unknown> = {
    vue: { ...vue, onMounted: (fn: () => void) => hooks.mounted.push(fn), onUnmounted: (fn: () => void) => hooks.unmount.push(fn) },
    '@dcloudio/uni-app': { onLoad: (fn: () => void) => hooks.load.push(fn), onShow: (fn: () => void) => hooks.show.push(fn), onHide: (fn: () => void) => hooks.hide.push(fn) },
    '@/api/learning-attempt-key': { currentPendingLearningAttempt: registry.currentAttempt.bind(registry), pendingLearningAttempt: registry.getOrCreateAttempt.bind(registry), finishPendingLearningAttempt: registry.finish.bind(registry) },
    '@/api/learning-runtime': { learningApi: api }, '@/api/runtime': { remoteApiEnabled: true },
    '@/api/order-api': { captureRuntimeRevision, subscribeRuntimeRevision: () => () => {} }, '@/api/errors': { ApiError },
    '@/lib/route': { navTo: vi.fn(), navBack: vi.fn(), navReplace: vi.fn(), takeNavigationQuery: () => '' },
    '@/lib/course-duration': { courseDurationText }, './course-navigation': navigation,
    '@/lib/amount-display': { formatAmount }, '@/lib/learning-recommendation': { selectRecommendedCourse },
    '@/i18n/audit-ui': { useAuditUiCopy: () => vue.ref({}) }, '@/i18n/format': { fmt }, '@/i18n/use-t': { useT: () => vue.ref(zh) },
    '@/store/locale': { useLocaleStore: () => ({ code: 'zh' }) }, '@/store/app': { useApp: () => app },
    '@/lib/page-visibility-refresh': visibility, './learning-page-fence': { createLearningPageFenceReader },
    './learning-course-start': start, './learning-result-details': details,
    '@/lib/day-one-observation-recovery': { observationRecoveryRoute },
  };
  const script = source.split('<script setup lang="ts">')[1].split('</script>')[0]
    .replace(/\/\/ #ifdef H5\s+web = true;\s+\/\/ #endif/, web ? 'web = true;' : '');
  const js = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const scope = vue.effectScope(); scopes.push(scope);
  const worker = scope.run(() => new Function('require', 'exports', js + ';return { coursePresentation, displayCourse, displayCompleted, loading, error, course, load, answers, allAnswered, canSubmit, result, resultDetails, restartQuiz, selectAnswer, moveAnswer, finish, pendingAttempt, interactionLocked, recoverStart, startFailureText, startRecoveryLabel, startFailure };')(
    (name: string) => {
      if (name.endsWith('.vue')) return {};
      if (!(name in modules)) throw new Error(`Unexpected dependency ${name}`);
      return modules[name];
    }, {},
  ));
  const fire = (name: string, ...args: unknown[]) => hooks[name].forEach(fn => fn(...args));
  fire('load', { id: quiz.id }); fire('mounted'); await worker.load();
  return { worker, api, app, fire, navTo: (modules['@/lib/route'] as any).navTo };
}

describe('quiz answer and retry behavior', () => {
  it('clears recovery state when the page hides and prevents a stale recovery action', async () => {
    const { worker, api, navTo, fire } = await mount();
    api.start.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 428, code: 428, message: 'USER_ONBOARDING_REQUIRED' }));
    await worker.load();
    expect(worker.startFailure.value.reason).toBe('onboarding');
    fire('hide'); await worker.recoverStart();
    expect(worker.startFailure.value).toBeUndefined();
    expect(navTo).not.toHaveBeenCalled();
    expect(api.start).toHaveBeenCalledTimes(2);
    expect(worker.interactionLocked.value).toBe(true);
  });
  it.each([true, false])('routes an explicit setup refusal to the existing recovery page (web=%s), without submitting', async web => {
    const { worker, api, navTo } = await mount(quiz, web);
    api.start.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 428, code: 428, message: 'USER_ONBOARDING_REQUIRED' }));
    await worker.load();
    expect(worker.startFailureText.value).toBe(zh.learning.courseStartSetup);
    expect(worker.startRecoveryLabel.value).toBe(zh.home.dayOneObservationSetupAction);
    expect(worker.canSubmit.value).toBe(false);
    worker.selectAnswer(0, 1); await worker.finish();
    expect(worker.answers.value).toEqual([-1, -1]);
    await worker.recoverStart();
    expect(navTo).toHaveBeenCalledWith(web ? '/pages/register/success?setup=1' : '/pages/onboarding/estimator');
    expect(api.start).toHaveBeenCalledTimes(2);
    expect(api.submitQuiz).not.toHaveBeenCalled(); expect(api.complete).not.toHaveBeenCalled();
  });
  it('routes an explicit terms refusal to support without inventing a new consent flow, while network errors remain retryable', async () => {
    const { worker, api, navTo } = await mount();
    api.start.mockRejectedValueOnce(new ApiError({ kind: 'http', status: 428, code: 428, message: 'LEGAL_TERMS_ACK_REQUIRED' }));
    await worker.load(); await worker.recoverStart();
    expect(navTo).toHaveBeenCalledWith('/pages/support/messages');
    expect(worker.startRecoveryLabel.value).toBe(zh.conversations.contactSupport);
    expect(worker.startFailureText.value).toBe(zh.learning.courseStartTerms);
    api.start.mockRejectedValueOnce(new ApiError({ kind: 'network', message: 'LEGAL_TERMS_ACK_REQUIRED' }));
    await worker.load();
    expect(worker.startFailureText.value).toBe(zh.learning.courseStartNetwork);
    expect(worker.startRecoveryLabel.value).toBe(zh.ui.retry);
    await worker.recoverStart();
    expect(navTo).toHaveBeenCalledTimes(1);
    expect(api.start).toHaveBeenCalledTimes(4);
    expect(worker.startFailure.value).toBeUndefined();
    expect(worker.interactionLocked.value).toBe(false);
    expect(api.submitQuiz).not.toHaveBeenCalled(); expect(api.complete).not.toHaveBeenCalled();
    expect(source).toContain('data-testid="learning-start-recovery"');
  });
  it('initializes every question and gives the first option a keyboard entry before any answer', async () => {
    const { worker } = await mount();
    expect(worker.answers.value).toEqual([-1, -1]);
    expect(worker.canSubmit.value).toBe(false);
    expect(source).toContain('quizOptionTabIndex(answers[index], optionIndex, question.options.length, interactionLocked || loading)');
    for (const answer of [-1, undefined, NaN, 8, 0.5]) {
      expect([0, 1, 2].map(index => details.quizOptionTabIndex(answer, index, 3, false))).toEqual([0, -1, -1]);
    }
    worker.moveAnswer(0, 0, 1);
    expect(worker.answers.value).toEqual([1, -1]);
    expect([0, 1].map(index => details.quizOptionTabIndex(1, index, 2, false))).toEqual([-1, 0]);
    expect(details.quizOptionTabIndex(-1, 0, 2, true)).toBe(-1);
  });
  it('rejects sparse, missing and out-of-range answers, including after a failed retake', async () => {
    const { worker, api } = await mount();
    worker.selectAnswer(0, 0); worker.selectAnswer(1, 1); await worker.finish();
    expect(worker.resultDetails.value.passed).toBe(false);
    worker.restartQuiz();
    expect(worker.answers.value).toEqual([-1, -1]);
    expect(worker.result.value).toBeNull(); expect(worker.resultDetails.value).toBeNull();
    worker.selectAnswer(1, 2); await worker.finish();
    expect(worker.canSubmit.value).toBe(false); expect(api.submitQuiz).toHaveBeenCalledOnce();
    const sparse: number[] = []; sparse[1] = 1;
    for (const invalid of [sparse, new Array(2), [0], [0, 3], [0, NaN], [0, 0.5]]) {
      worker.answers.value = invalid; expect(worker.allAnswered.value).toBe(false);
      await worker.finish(); expect(api.submitQuiz).toHaveBeenCalledOnce();
      expect(details.validAnswersForCourse(quiz, invalid)).toBe(false);
    }
    worker.answers.value = [-1, 2]; worker.selectAnswer(0, 1); await worker.finish();
    expect(api.submitQuiz).toHaveBeenCalledTimes(2);
    expect(api.submitQuiz.mock.calls[1][3]).not.toBe(api.submitQuiz.mock.calls[0][3]);
    expect(worker.resultDetails.value.passed).toBe(false);
  });
  it('hides reloaded historical failure during a new answer session without rewriting attempts', async () => {
    const { worker, api } = await mount({ ...quiz, attempts: 2, lastScore: 50 });
    expect(worker.resultDetails.value.attempts).toBe(2);
    worker.restartQuiz(); expect(worker.resultDetails.value).toBeNull();
    expect(api.submitQuiz).not.toHaveBeenCalled();
    await worker.load(); expect(worker.resultDetails.value.attempts).toBe(2);
  });
  it('replays an uncommitted request with the original answers and idempotency key', async () => {
    const { worker, api } = await mount();
    api.submitQuiz.mockRejectedValueOnce(new Error('Disconnected'));
    api.quizReceipt.mockResolvedValueOnce({ status: 'ABSENT', committed: false, result: null });
    worker.selectAnswer(0, 0); worker.selectAnswer(1, 1); await worker.finish();
    expect(api.submitQuiz.mock.calls[1]).toEqual(api.submitQuiz.mock.calls[0]);
    expect(worker.pendingAttempt.value).toBeNull();
  });
  it('does not mistake the previous failed attempt readback for a newly submitted retake', async () => {
    const { worker, api } = await mount();
    worker.selectAnswer(0, 0); worker.selectAnswer(1, 1); await worker.finish();
    expect(worker.resultDetails.value.attempts).toBe(1);
    worker.restartQuiz(); worker.selectAnswer(0, 1); worker.selectAnswer(1, 2);
    api.submitQuiz.mockRejectedValueOnce(new Error('Retake response lost'));
    api.quizReceipt.mockRejectedValueOnce(new Error('Receipt unavailable'));
    api.course.mockResolvedValueOnce({ ...quiz, attempts: 1, lastScore: 50 });
    await worker.finish();
    expect(worker.pendingAttempt.value).toMatchObject({ key: api.submitQuiz.mock.calls[1][3], answers: [1, 2] });
    expect(worker.interactionLocked.value).toBe(true);
    expect(worker.resultDetails.value).toBeNull();
    worker.restartQuiz(); await worker.finish();
    expect(api.submitQuiz).toHaveBeenCalledTimes(2);
  });
  it('holds unknown submissions against retakes and discards late results after an account change', async () => {
    const { worker, api, app } = await mount();
    api.submitQuiz.mockRejectedValueOnce(new Error('Disconnected'));
    worker.selectAnswer(0, 0); worker.selectAnswer(1, 1); await worker.finish();
    const pending = worker.pendingAttempt.value;
    worker.restartQuiz(); worker.selectAnswer(0, 1);
    expect(worker.answers.value).toEqual([0, 1]); expect(worker.pendingAttempt.value).toEqual(pending);
    expect(worker.interactionLocked.value).toBe(true);
    // Resolve a fresh page's request only after its account fence changes.
    const h = await mount(); let settle!: (value: LearningResult) => void;
    h.api.submitQuiz.mockImplementationOnce(() => new Promise(resolve => { settle = resolve; }));
    h.worker.selectAnswer(0, 0); h.worker.selectAnswer(1, 1); const request = h.worker.finish();
    h.app.accountKey = 'b'; h.app.accountBindingEpoch++; await vue.nextTick();
    settle(failed); await request; await h.worker.load();
    expect(h.worker.result.value).toBeNull(); expect(h.worker.answers.value).toEqual([-1, -1]);
    expect(app.accountKey).toBe('a');
  });
});

it("keeps published lesson text through warm/hide reads while all quiz authority stays live", async () => {
  const { worker, api, fire } = await mount();
  worker.selectAnswer(0, 1);
  fire("hide");
  expect(worker.displayCourse.value.body).toBe("Lesson");
  expect(worker.course.value).toBeNull();
  expect(worker.answers.value).toEqual([]);
  expect(worker.canSubmit.value).toBe(false);
  let resolve!: (value: LearningCourse) => void;
  api.course.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  fire("show"); await vue.nextTick();
  expect(worker.displayCourse.value.body).toBe("Lesson");
  await worker.finish(); expect(api.submitQuiz).not.toHaveBeenCalled();
  resolve({...quiz, version:"v3",body:"New lesson"}); await worker.load();
  expect(worker.displayCourse.value.body).toBe("New lesson");
  expect(worker.answers.value).toEqual([-1,-1]);
});
it.each([401,403])("clears lesson presentation after current %s and fences late account reads", async status => {
  const { worker, api, app } = await mount();
  api.course.mockRejectedValueOnce(new ApiError({kind:"http",status,code:status,message:"FORBIDDEN"}));
  await worker.load(); expect(worker.displayCourse.value).toBeNull();
  let finish!: (value: LearningCourse) => void;
  api.course.mockImplementationOnce(() => new Promise(done => {finish=done;}));
  const old=worker.load();
  api.course.mockImplementation(()=>new Promise(()=>{}));
  app.accountBindingEpoch++; await vue.nextTick();
  expect(worker.displayCourse.value).toBeNull();
  finish({...quiz,body:"Old response"}); await old; await vue.nextTick();
  expect(worker.displayCourse.value?.body).not.toBe("Old response");
});

it("does not retain private answers in published presentation during an active warm read",async()=>{
 const {worker,api}=await mount();worker.selectAnswer(0,1);
 let finish!:(value:LearningCourse)=>void;api.course.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 const read=worker.load();expect(worker.displayCourse.value.body).toBe("Lesson");expect(worker.answers.value).toEqual([]);
 expect(worker.canSubmit.value).toBe(false);await worker.finish();expect(api.submitQuiz).not.toHaveBeenCalled();
 finish(quiz);await read;
});
