import * as Vue from "vue";
import { computed, reactive } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileScript, compileTemplate, parse } from "@vue/compiler-sfc";
import { initPreContext, preHtml, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import earnSource from "./earn.vue?raw";
import cardSource from "@/components/earn/earn-way-card.vue?raw";
import buttonSource from "@/components/ui/nx-button.vue?raw";
import sectionSource from "@/components/ui/nx-section.vue?raw";
import { remainderUiCopy } from "@/i18n/remainder-ui";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";

function compile(source: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
}

function fixture(platform: "h5" | "app", nativeAvailable: boolean) {
  initPreContext(platform);
  const { descriptor } = parse(preJs(preHtml(earnSource, "earn.vue"), "earn.vue"));
  const script = descriptor.scriptSetup!.content;
  const config = reactive({
    configStatus: "ready", visible: true, computeVisible: true,
    isEnabled(flag: string) { return flag === "stakingVisible" ? this.visible : flag === "computeShareEnabled" && this.computeVisible; },
  });
  const navTo = vi.fn();
  const actions = compile(script.slice(script.indexOf("const config = useConfig();"), script.indexOf("const range = ref")) + `
    return { stakingVisible, goStaking, nativePhoneAvailable,
      ...(typeof goPhoneCompute === "function" ? { goPhoneCompute } : { goPhoneDownload }),
      phone: typeof goPhoneCompute === "function" ? goPhoneCompute : goPhoneDownload };`, {
    computed, useConfig: () => config, hasNativeAndroidPhoneRuntime: () => nativeAvailable, hasNativePhoneRuntime: () => nativeAvailable, nativePhonePlatform: () => null, navTo,
  });
  return { actions, config, navTo, template: descriptor.template!.content };
}

describe("earn more ways platform and availability gates", () => {
  it("H5 only offers the download guide, even if a native runtime is injected", () => {
    const f = fixture("h5", true);
    expect(f.template).toContain('@click="goPhoneDownload"');
    expect(f.template).not.toContain('@click="goPhoneCompute"');
    f.actions.phone();
    expect(f.navTo).toHaveBeenCalledWith("/pages/register/success?download=1");
  });

  it.each([true, false])("APP uses native calibration only when available: %s", (available) => {
    const f = fixture("app", available);
    expect(f.template).not.toContain("goPhoneDownload");
    expect(f.template).not.toContain("remainderCopy.downloadApp");
    f.actions.phone();
    expect(f.navTo).toHaveBeenCalledWith(available ? "/pages/onboarding/connect?mode=recalibrate" : "/pages/me/devices");
  });

  it("staking hides and refuses navigation when its flag or confirmed config changes", () => {
    const f = fixture("app", true);
    f.actions.goStaking();
    expect(f.navTo).toHaveBeenCalledWith("/pages/staking/staking");
    for (const [status, visible] of [["loading", true], ["failed", true], ["ready", false]] as const) {
      f.navTo.mockClear();
      f.config.configStatus = status;
      f.config.visible = visible;
      expect(f.actions.stakingVisible.value).toBe(false);
      f.actions.goStaking();
      expect(f.navTo).not.toHaveBeenCalled();
    }
  });

});

type Host = { type: string; text: string; props: Record<string, any>; children: Host[]; parent: Host | null };
const host = (type: string, text = ""): Host => ({ type, text, props: {}, children: [], parent: null });
const renderer = Vue.createRenderer<Host, Host>({
  createElement: type => host(type), createText: text => host('#text', text), createComment: text => host('#comment', text),
  setText: (node, text) => { node.text = text; }, setElementText: (node, text) => { node.text = text; node.children = []; },
  patchProp: (node, key, _old, value) => { node.props[key] = value; },
  insert(node, parent, anchor) {
    if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    parent.children.splice(index < 0 ? parent.children.length : index, 0, node); node.parent = parent;
  },
  remove(node) { if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1); node.parent = null; },
  parentNode: node => node.parent, nextSibling: node => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
});
const mounted: Vue.App[] = [];
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()); vi.unstubAllGlobals(); });
function nodes(root: Host): Host[] { return [root, ...root.children.flatMap(nodes)]; }
function withClass(root: Host, name: string) { return nodes(root).filter(node => String(node.props.class ?? '').split(' ').includes(name)); }
function textOf(root: Host): string { return nodes(root).filter(node => node.type !== '#comment').map(node => node.text).join(' '); }

function component(source: string, name: string, dependencies: Record<string, unknown>) {
  const { descriptor } = parse(preJs(preHtml(source, name), name), { filename: name });
  const result = compileScript(descriptor, { id: name, inlineTemplate: true, templateOptions: { compilerOptions: { hoistStatic: false } } });
  const code = ts.transpileModule(result.content, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as { default: Vue.Component } };
  new Function('require', 'module', 'exports', code)((key: string) => {
    if (key === 'vue') return Vue;
    if (!(key in dependencies)) throw new Error(`Missing test dependency: ${key}`);
    return dependencies[key];
  }, module, module.exports);
  return module.exports.default;
}

function renderWays(platform: 'h5' | 'app', language: 'zh' | 'en' | 'vi') {
  const f = fixture(platform, true), copy = remainderUiCopy[language], messages = { zh, en, vi: vietnamese }[language];
  const account = reactive({ activeSlotCount: 0, slotCap: 1 }), trial = Vue.ref(false);
  const vibrate = vi.fn(); vi.stubGlobal('uni', { vibrateShort: vibrate });
  const button = component(buttonSource, 'nx-button.vue', { '@/components/liquid-glass.vue': { default: Vue.defineComponent({ render: () => Vue.h('view', { class: 'test-liquid-glass' }) }) } });
  const card = component(cardSource, 'earn-way-card.vue', {
    '@/components/ui/nx-button.vue': { default: button },
  });
  const section = component(sectionSource, 'nx-section.vue', { './nx-button.vue': { default: button } });
  const source = f.template.slice(f.template.indexOf('<NxSection class="mx-4 earn-more-ways"'), f.template.indexOf('</NxSection>') + '</NxSection>'.length);
  const compiled = compileTemplate({ source, filename: 'earn-section.vue', id: 'earn-section', compilerOptions: { mode: 'function' } });
  if (compiled.errors.length) throw new Error(compiled.errors.join('\n'));
  const root = host('root');
  const screen = renderer.createApp(Vue.defineComponent({
    components: { NxSection: section, EarnWayCard: card, TrialGhostSlot: { render: () => null } },
    setup: () => ({ ...f.actions, remainderCopy: copy, auditCopy: { moreWays: 'More ways' } }),
    render: new Function('Vue', compiled.code)(Vue),
  }));
  screen.mount(root); mounted.push(screen);
  function buttonByLabel(label: string) {
    const found = nodes(root).find(node => node.props.role === 'button' && node.props['aria-label'] === label);
    expect(found, `button ${label}`).toBeDefined(); return found!;
  }
  return { ...f, root, copy, messages, account, trial, vibrate, buttonByLabel };
}

describe('earn cards render the actual entry controls', () => {
  it.each(['zh', 'en', 'vi'] as const)('renders the remaining two cards with complete %s copy and existing destinations', language => {
    const f = renderWays('h5', language);
    expect(withClass(f.root, 'earn-way-card')).toHaveLength(2);
    for (const artwork of ['phone', 'staking']) {
      expect(withClass(f.root, `earn-way-card--${artwork}`)).toHaveLength(1);
    }
    for (const text of [f.copy.earnWays.phoneBody, f.copy.earnWays.stakingBody]) expect(textOf(f.root)).toContain(text);
    for (const label of [f.copy.downloadApp, f.copy.stakingAction]) {
      const button = f.buttonByLabel(label); expect(button.props.tabindex).toBe(0); button.props.onClick();
    }
    expect(f.navTo.mock.calls).toEqual([['/pages/register/success?download=1'], ['/pages/staking/staking']]);
    expect(f.vibrate).not.toHaveBeenCalled();
  });

  it('native taps give one light response per action', () => {
    const f = renderWays('app', 'zh');
    f.buttonByLabel(f.copy.earnWays.phoneAction).props.onClick();
    expect(f.navTo).toHaveBeenCalledExactlyOnceWith('/pages/onboarding/connect?mode=recalibrate');
    expect(f.vibrate).toHaveBeenCalledExactlyOnceWith({ type: 'light' });
    f.buttonByLabel(f.copy.stakingAction).props.onClick();
    expect(f.navTo).toHaveBeenLastCalledWith('/pages/staking/staking'); expect(f.vibrate).toHaveBeenCalledTimes(2);
  });

  it('removes only gated cards when config becomes unconfirmed, and restores each feature independently', async () => {
    const f = renderWays('h5', 'en');
    f.config.configStatus = 'loading'; await Vue.nextTick();
    expect(withClass(f.root, 'earn-way-card')).toHaveLength(1);
    f.config.configStatus = 'ready'; f.config.visible = false; await Vue.nextTick();
    expect(withClass(f.root, 'earn-way-card')).toHaveLength(1);
    expect(textOf(f.root)).not.toContain(f.copy.earnWays.gpuTitle);
    f.config.computeVisible = false; await Vue.nextTick();
    expect(withClass(f.root, 'earn-way-card')).toHaveLength(1);
  });


});
