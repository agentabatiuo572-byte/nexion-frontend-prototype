import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, it, vi } from "vitest";
import source from "./featured-learning-card.vue?raw";
import { formatAmount } from "@/lib/amount-display";
import { courseDurationText } from "@/lib/course-duration";
import { selectRecommendedCourse } from "@/lib/learning-recommendation";
import { learningRecommendationCopy } from "@/i18n/learning-recommendation";
import { fmt } from "@/i18n/format";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";

const script = compileScript(parse(source).descriptor, { id: "learning-recommendation", inlineTemplate: true,
  templateOptions: { compilerOptions: { hoistStatic: false } } });
const code = ts.transpileModule(script.content, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
type Host = { text: string; props: Record<string, any>; parent: Host | null; children: Host[] };
const node = (text = ""): Host => ({ text, props: {}, parent: null, children: [] });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: () => node(), createText: node, createComment: () => node(),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _old, next) => { target.props[key] = next; },
  parentNode: target => target.parent,
  nextSibling: target => target.parent?.children[target.parent.children.indexOf(target) + 1] ?? null,
  insert: (target, parent, anchor) => {
    if (target.parent) target.parent.children = target.parent.children.filter(entry => entry !== target);
    target.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(target); else parent.children.splice(index, 0, target);
  },
  remove: target => { if (target.parent) target.parent.children = target.parent.children.filter(entry => entry !== target); },
});
const text = (root: Host): string => root.text + root.children.map(text).join("");
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const unmounts: Array<() => void> = [];
afterEach(() => unmounts.splice(0).forEach(unmount => unmount()));
const dictionaries = { zh, en, vi: vietnamese };
const course = (id: string, featured = false, completed = false, progress = 0) => ({
  id, title: id, featured, completed, progress: completed ? 100 : progress, duration: "5 min", rewardNex: "1.25",
});
const flush = async () => { await Promise.resolve(); await Vue.nextTick(); };

async function mount(courses: ReturnType<typeof course>[], language: keyof typeof dictionaries = "zh") {
  const account = Vue.reactive({ accountKey: "user:a", accountBindingEpoch: 0 });
  const locale = Vue.reactive({ code: language });
  const runtime = { epoch: 0 };
  const request = vi.fn().mockResolvedValue({ courses });
  const navTo = vi.fn();
  let shown = () => {}; let hidden = () => {};
  let runtimeChanged = () => {};
  const unsubscribeRuntime = vi.fn();
  const modules: Record<string, unknown> = {
    vue: Vue, "@/lib/amount-display": { formatAmount }, "@/lib/course-duration": { courseDurationText },
    "@/lib/learning-recommendation": { selectRecommendedCourse }, "@/i18n/learning-recommendation": { learningRecommendationCopy },
    "@/i18n/format": { fmt }, "@/i18n/use-t": { useT: () => Vue.computed(() => dictionaries[locale.code]) },
    "@/store/app": { useApp: () => account }, "@/store/locale": { useLocaleStore: () => locale },
    "@/api/runtime": { remoteApiEnabled: true }, "@/api/order-api": {
      captureRuntimeRevision: () => runtime,
      subscribeRuntimeRevision: (fn: () => void) => { runtimeChanged = fn; return unsubscribeRuntime; },
    },
    "@/api/learning-runtime": { learningApi: { courses: request } }, "@/lib/route": { navTo },
    "@/composables/use-tab-page-lifecycle": { onShow: (fn: () => void) => { shown = fn; }, onHide: (fn: () => void) => { hidden = fn; } },
  };
  const exports = { default: {} as Vue.Component };
  new Function("require", "exports", code)((id: string) => modules[id], exports);
  const root = node(); const app = renderer.createApp(exports.default);
  app.mount(root); unmounts.push(() => app.unmount()); await flush();
  return { account, locale, runtime, request, navTo, shown: () => shown(), hidden: () => hidden(),
    changeRuntime: () => { runtime.epoch += 1; runtimeChanged(); }, unmount: () => app.unmount(), unsubscribeRuntime,
    text: () => text(root), link: () => all(root).find(entry => entry.props.role === "link"),
    progress: () => all(root).find(entry => entry.props.role === "progressbar") };
}

it.each(["zh", "en", "vi"] as const)("renders recommendation, progress, next course and completion in %s", async language => {
  const current = course("featured", true, false, 30); const next = course("ordinary");
  const card = await mount([next, current], language);
  expect(card.text()).toContain("featured"); expect(card.text()).not.toContain("ordinary");
  expect(card.text()).toContain(learningRecommendationCopy[language].resume);
  expect(card.progress()?.props["aria-valuenow"]).toBe(30);
  card.link()!.props.onClick();
  expect(card.navTo).toHaveBeenLastCalledWith("/pages/learn/course?id=featured&source=missions");
  card.hidden(); await Vue.nextTick(); expect(card.text()).toBe("");
  current.completed = true; current.progress = 100; card.shown(); await flush();
  expect(card.text()).toContain("ordinary"); expect(card.text()).not.toContain("featured");
  expect(card.text()).toContain(learningRecommendationCopy[language].start);
  next.completed = true; next.progress = 100; card.hidden(); card.shown(); await flush();
  expect(card.text()).toContain(learningRecommendationCopy[language].completed);
  expect(card.progress()).toBeUndefined(); card.link()!.props.onClick();
  expect(card.navTo).toHaveBeenLastCalledWith("/pages/learn/courses");
});

it("does not turn empty or failed reads into completion, and recovers on return", async () => {
  const card = await mount([]); expect(card.text()).toBe("");
  card.request.mockRejectedValueOnce(new Error("offline")); card.hidden(); card.shown(); await flush();
  expect(card.text()).toBe("");
  card.request.mockResolvedValueOnce({ courses: [course("recovered")] }); card.hidden(); card.shown(); await flush();
  expect(card.text()).toContain("recovered");
});

it("clears already rendered progress and reads the new runtime, then removes its listener", async () => {
  const card = await mount([course("previous", true, false, 60)]);
  expect(card.text()).toContain("previous");
  let resolve!: (value: unknown) => void;
  card.request.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  card.changeRuntime(); await Vue.nextTick(); expect(card.text()).toBe("");
  resolve({ courses: [course("new-runtime")] }); await flush();
  expect(card.text()).toContain("new-runtime"); expect(card.text()).not.toContain("previous");
  card.unmount(); expect(card.unsubscribeRuntime).toHaveBeenCalledOnce();
});

it.each(["account", "binding", "language", "runtime", "hidden"])("rejects an old response after %s changes", async change => {
  const card = await mount([course("previous")]);
  let resolve!: (value: unknown) => void;
  card.request.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  card.hidden(); card.shown(); await flush();
  card.request.mockResolvedValue({ courses: [] });
  if (change === "account") card.account.accountKey = "user:b";
  if (change === "binding") card.account.accountBindingEpoch += 1;
  if (change === "language") card.locale.code = "en";
  if (change === "runtime") card.runtime.epoch += 1;
  if (change === "hidden") card.hidden();
  await flush(); resolve({ courses: [course("stale-result")] }); await flush();
  expect(card.text()).toBe("");
});
