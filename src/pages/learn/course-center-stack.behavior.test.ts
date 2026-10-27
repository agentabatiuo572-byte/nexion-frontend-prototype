import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';
import { ref } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import source from './course.vue?raw';

vi.mock('@/store/trial-claim-sheet', () => ({ useTrialClaimSheet: () => ({ closeTransient() {} }) }));
vi.mock('@/store/voucher-claim-sheet', () => ({ useVoucherClaimSheet: () => ({ closeTransient() {} }) }));
vi.mock('@/store/ui', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/i18n/use-t', () => ({ getT: () => ({ ui: { navigationFailed: 'Navigation failed' } }) }));
import { navReplace, navTo } from '@/lib/route';

const ast = ts.createSourceFile('course.ts', parse(source).descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && ['backToCourses', 'openNextCourse'].includes(node.name?.text ?? '')).map(node => node.getText(ast)).join('\n');
const code = ts.transpileModule(functions, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const missions = 'pages/missions/missions', center = 'pages/learn/courses', course = 'pages/learn/course';
type Page = { route: string; options?: Record<string, string>; scrollTop?: number };
type Options = { url?: string; delta?: number; success?: (result: unknown) => void; fail?: (result: unknown) => void };
function mount(routes: string[]) {
  const pages: Page[] = routes.map(route => ({ route })), recommendedNext = ref<{ id: string } | null>({ id: 'course B' });
  const entry = (url: string): Page => {
    const options: Record<string, string> = {}; new URLSearchParams(url.split('?')[1] ?? '').forEach((value, key) => { options[key] = value; });
    return { route: url.split('?')[0].replace(/^\//, ''), options };
  };
  const navigateBack = vi.fn((options: Options = {}) => { pages.splice(Math.max(1, pages.length - (options.delta ?? 1))); options.success?.({}); });
  const redirectTo = vi.fn((options: Options) => { if (!pages.length) { options.fail?.({}); return; } pages.splice(-1, 1, entry(options.url!)); options.success?.({}); });
  const reLaunch = vi.fn((options: Options) => { pages.splice(0, pages.length, entry(options.url!)); options.success?.({}); });
  const navigateTo = vi.fn((options: Options) => { pages.push(entry(options.url!)); options.success?.({}); });
  vi.stubGlobal('getCurrentPages', () => pages);
  vi.stubGlobal('uni', { navigateBack, redirectTo, reLaunch, navigateTo, showToast: vi.fn() });
  const actions = new Function('navReplace', 'navTo', 'recommendedNext', code + '\nreturn {backToCourses,openNextCourse};')(navReplace, navTo, recommendedNext);
  return { pages, actions, recommendedNext, navigateBack, redirectTo, reLaunch, routes: () => pages.map(page => page.route.replace(/^\//, '')) };
}
afterEach(() => vi.unstubAllGlobals());

it('actual result action returns to the existing center and one Android Back reaches Missions', () => {
  const h = mount([missions, center, course]), existing = h.pages[1]; existing.scrollTop = 620;
  h.actions.backToCourses(); expect(h.routes()).toEqual([missions, center]); expect(h.pages[1]).toBe(existing); expect(h.pages[1].scrollTop).toBe(620);
  expect(h.navigateBack).toHaveBeenCalledWith(expect.objectContaining({ delta: 1 })); expect(h.redirectTo).not.toHaveBeenCalled();
  h.navigateBack({}); expect(h.routes()).toEqual([missions]);
});

it('actual next-course pushes are popped together to the nearest existing center', () => {
  const h = mount([missions, center, course]);
  h.actions.openNextCourse(); h.recommendedNext.value = { id: 'course C' }; h.actions.openNextCourse();
  expect(h.routes()).toEqual([missions, center, course, course, course]);
  expect(h.pages.slice(-2).map(page => page.options?.id)).toEqual(['course B', 'course C']);
  h.actions.backToCourses(); expect(h.routes()).toEqual([missions, center]); expect(h.navigateBack).toHaveBeenCalledWith(expect.objectContaining({ delta: 3 }));
  h.navigateBack({}); expect(h.routes()).toEqual([missions]);
});

it('the nearest center is reused without rewriting earlier user history', () => {
  const h = mount([missions, center, course, center, course, course]), recent = h.pages[3];
  h.actions.backToCourses(); expect(h.routes()).toEqual([missions, center, course, center]); expect(h.pages[3]).toBe(recent);
  expect(h.navigateBack).toHaveBeenCalledWith(expect.objectContaining({ delta: 2 }));
});

it.each(['pages/missions/missions', 'pages/index/index', 'pages/me/rewards-list'])('direct %s course entry still goes to the center rather than popping to its source', origin => {
  const h = mount([origin, course]); h.actions.backToCourses();
  expect(h.routes()).toEqual([origin, center]); expect(h.navigateBack).not.toHaveBeenCalled(); expect(h.redirectTo).toHaveBeenCalledOnce();
});

it.each([{ routes: [course] }, { routes: [] }])('cold/deep-link stack %j preserves the explicit center destination', ({ routes }) => {
  const h = mount(routes); h.actions.backToCourses(); expect(h.routes()).toEqual([center]); expect(h.navigateBack).not.toHaveBeenCalled();
});

it('an unrelated intervening page is never popped just because an older center exists', () => {
  const h = mount([missions, center, 'pages/support/messages', course, course]); h.actions.backToCourses();
  expect(h.routes()).toEqual([missions, center, 'pages/support/messages', course, center]); expect(h.navigateBack).not.toHaveBeenCalled();
});

it('unknown and non-current-course routes cannot authorize a stack pop', () => {
  const h = mount([missions, center, course, 'pages/support/messages']); h.actions.backToCourses();
  expect(h.navigateBack).not.toHaveBeenCalled(); expect(h.routes()).toEqual([missions, center, course, center]);
});

it('normal leading-slash route representations still identify the adjacent center', () => {
  const h = mount([missions, '/' + center, '/' + course]); h.actions.backToCourses(); expect(h.routes()).toEqual([missions, center]);
  expect(h.navigateBack).toHaveBeenCalledOnce();
});

it.each(['failed', 'throws'] as const)('a %s native pop keeps the original replacement fallback', failure => {
  const h = mount([missions, center, course]);
  h.navigateBack.mockImplementation(options => { if (failure === 'throws') throw new Error('pop unavailable'); options?.fail?.({}); });
  h.actions.backToCourses(); expect(h.routes()).toEqual([missions, center, center]); expect(h.redirectTo).toHaveBeenCalledOnce();
});

it('an unreadable platform stack still uses the declared center', () => {
  const h = mount([missions, course]); vi.stubGlobal('getCurrentPages', () => { throw new Error('unavailable'); });
  h.actions.backToCourses(); expect(h.routes()).toEqual([missions, center]); expect(h.navigateBack).not.toHaveBeenCalled();
});
