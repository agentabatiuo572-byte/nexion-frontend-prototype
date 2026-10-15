import * as Vue from "vue";
import type { Component } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import raw from "./trial-claim-sheet.vue?raw";
import { computeTrialOffset } from "@/store/trial-config";
import { fmt } from "@/i18n/format";
import { formatAmount } from "@/lib/amount-display";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";

type HostNode = { type: string; text: string; parent: HostNode | null; children: HostNode[]; props: Record<string, unknown> };
const node = (type: string, text = ""): HostNode => ({ type, text, parent: null, children: [], props: {} });
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: type => node(type), createText: text => node("text", text), createComment: () => node("comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent) => { child.parent = parent; parent.children.push(child); },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(entry => entry !== child); },
});
const content = (target: HostNode): string => target.text + target.children.map(content).join("");
const findClass = (target: HostNode, name: string): HostNode | undefined =>
  String(target.props.class ?? "").split(/\s+/).includes(name) ? target : target.children.map(child => findClass(child, name)).find(Boolean);
const cleanups: Array<() => void> = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));

async function mount(platform: "H5" | "APP", messages = zh) {
  const source = raw.replace(/\/\/ #(ifdef|ifndef) H5\r?\n([\s\S]*?)\/\/ #endif/g,
    (_all, condition: string, body: string) => (condition === "ifdef") === (platform === "H5") ? body : "");
  const script = compileScript(parse(source, { filename: "trial-claim-sheet.vue" }).descriptor,
    { id: "trial-claim-prerequisite", inlineTemplate: true });
  const code = ts.transpileModule(script.content,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const sheet = Vue.reactive({ open: true, hide: vi.fn(() => { sheet.open = false; }),
    closeTransient: vi.fn(() => { sheet.open = false; }) });
  const appState = Vue.reactive({ accountBindingEpoch: 1 });
  const start = vi.fn().mockResolvedValue({ ok: false, reason: "onboarding-required" });
  const navTo = vi.fn(), toast = { info: vi.fn(), success: vi.fn() };
  const modules: Record<string, unknown> = {
    "@/lib/amount-display": { formatAmount },
    vue: Vue, "@/lib/route": { navTo }, "@/store/app": { useApp: () => appState },
    "@/store/trial-claim-sheet": { useTrialClaimSheet: () => sheet },
    "@/store/trial-config": { useTrialConfig: () => ({ config: { trialDays: 3, shadowDailyUSD: 1,
      trialOffsetCapUSD: 50, discountCapUSD: 50, discountRate: 0.15 } }), computeTrialOffset },
    "@/store/free-trial": { useFreeTrial: () => ({ start }) }, "@/store/ui": { toast },
    "@/i18n/use-t": { useT: () => Vue.ref(messages) }, "@/i18n/format": { fmt },
    "@/composables/use-dialog-a11y": { useDialogA11y: vi.fn() },
  };
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected component import: ${id}`);
    return modules[id];
  }, exports);
  const root = node("root"), app = renderer.createApp(exports.default);
  app.mount(root); cleanups.push(() => app.unmount()); await Vue.nextTick();
  return { root, sheet, appState, start, navTo, toast,
    claim: () => (findClass(root, "tcs-claim")!.props.onClick as (event: unknown) => Promise<void>)({ stopPropagation: vi.fn() }),
    primary: () => findClass(root, "tcs-claim")! };
}

test.each([zh, en, vietnamese])("renders a prerequisite recovery action in both platforms without a second claim", async messages => {
  for (const platform of ["H5", "APP"] as const) {
    const view = await mount(platform, messages); await view.claim(); await Vue.nextTick();
    expect(view.sheet.open).toBe(true); expect(view.start).toHaveBeenCalledOnce();
    expect(content(view.root)).toContain(messages.trial.claimOnboardingRequired);
    expect(content(view.primary())).toBe(messages.trial.claimOnboardingCta);
    expect(view.primary().props["aria-label"]).toBe(messages.trial.claimOnboardingCta);
    expect(content(view.root)).not.toContain(messages.trial.claimUnknownInline);
    expect(content(view.root)).not.toContain(messages.trial.claimRetryCta);
    expect(view.navTo).not.toHaveBeenCalled(); expect(view.toast.success).not.toHaveBeenCalled();
    await view.claim();
    expect(view.navTo).toHaveBeenCalledExactlyOnceWith(platform === "H5"
      ? "/pages/register/success?setup=1" : "/pages/onboarding/estimator");
    expect(view.start).toHaveBeenCalledOnce(); expect(view.sheet.open).toBe(false);
  }
});

test("terms recovery enters the existing acknowledgement page without replaying start", async () => {
  const view = await mount("H5"); view.start.mockResolvedValue({ ok: false, reason: "terms-required" });
  await view.claim(); await Vue.nextTick();
  expect(content(view.root)).toContain(zh.trial.claimTermsRequired);
  expect(content(view.primary())).toBe(zh.trial.claimTermsCta);
  await view.claim(); expect(view.navTo).toHaveBeenCalledExactlyOnceWith("/pages/onboarding/terms");
  expect(view.start).toHaveBeenCalledOnce();
});

test("unknown results retain the existing explicit retry action", async () => {
  const view = await mount("H5"); view.start.mockResolvedValue({ ok: false, reason: "unknown" });
  await view.claim(); await Vue.nextTick();
  expect(content(view.root)).toContain(zh.trial.claimUnknownInline);
  expect(content(view.primary())).toBe(zh.trial.claimRetryCta);
  await view.claim(); expect(view.start).toHaveBeenCalledTimes(2); expect(view.navTo).not.toHaveBeenCalled();
});

test.each([true, false])("clears prerequisite feedback on a same-account rebind (pending=%s)", async pending => {
  const view = await mount("H5");
  let resolve!: (value: { ok: boolean; reason: string }) => void;
  if (pending) view.start.mockReturnValue(new Promise(done => { resolve = done; }));
  const command = view.claim(); if (!pending) await command;
  view.appState.accountBindingEpoch++; await Vue.nextTick();
  if (pending) { resolve({ ok: false, reason: "onboarding-required" }); await command; }
  await Vue.nextTick();
  expect(view.sheet.open).toBe(false); expect(view.navTo).not.toHaveBeenCalled();
  view.sheet.open = true; await Vue.nextTick();
  expect(content(view.root)).not.toContain(zh.trial.claimOnboardingRequired);
  expect(content(view.primary())).toBe(zh.trial.sheetClaimCta);
});
