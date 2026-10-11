import * as Vue from "vue";
import type { Component } from "vue";
// @ts-expect-error Node-only SFC harness, matching the existing repository tests.
import { createRequire } from "node:module";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, test, vi } from "vitest";
import nativeSource from "./native-svg.vue?raw";
import { svgMarkup } from "@/lib/native-svg-markup";

const require = createRequire(import.meta.url);
const productionVue = require("@vue/runtime-core/dist/runtime-core.cjs.prod.js") as typeof Vue;
const { nativeSvgIcons } = require("../../scripts/native-svg-icons.mjs") as {
  nativeSvgIcons: () => { transform: (source: string, id: string) => { code: string } | null };
};
const runtimes = [{ name: "development", vue: Vue }, { name: "production", vue: productionVue }];

// Use the installed compiler and real component lifecycle, without an SFC
// plugin or DOM. The parent models me.vue's v-for item captured by a slot.
function compile(source: string, filename: string, vue: typeof Vue): Component {
  const { descriptor } = parse(source, { filename });
  const script = compileScript(descriptor, { id: filename, inlineTemplate: true,
    templateOptions: { compilerOptions: { isCustomElement: tag => ["view", "text"].includes(tag) } } });
  const code = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = { default: {} as Component };
  const dependencies: Record<string, unknown> = { vue, "@/lib/native-svg-markup": { svgMarkup } };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected production import: ${id}`);
    return dependencies[id];
  }, exports);
  return exports.default;
}

type Host = { tag: string; text: string; props: Record<string, unknown>; parent: Host | null; children: Host[] };
const node = (tag: string, text = ""): Host => ({ tag, text, props: {}, parent: null, children: [] });
const all = (root: Host): Host[] => [root, ...root.children.flatMap(all)];
const unmounts: Array<() => void> = [];
afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.unstubAllEnvs(); });

function mount(vue: typeof Vue, source: string, initial: Record<string, unknown>) {
  const renderer = vue.createRenderer<Host, Host>({
    createElement: tag => node(tag), createText: text => node("#text", text), createComment: () => node("#comment"),
    setText: (target, text) => { target.text = text; },
    setElementText: (target, text) => { target.text = text; target.children = []; },
    patchProp: (target, key, _previous, value) => { target.props[key] = value; },
    parentNode: child => child.parent,
    nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
    insert: (child, parent, anchor) => {
      if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child);
      child.parent = parent;
      const at = anchor ? parent.children.indexOf(anchor) : -1;
      if (at < 0) parent.children.push(child); else parent.children.splice(at, 0, child);
    },
    remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(item => item !== child); },
  });
  const NativeSvg = compile(nativeSource, "native-svg.vue", vue);
  const Parent = compile(source, "native-svg-parent.vue", vue);
  const props = vue.reactive(initial);
  const root = node("root");
  const app = renderer.createApp({ render: () => vue.h(Parent, { ...props }) });
  app.component("NxNativeSvg", NativeSvg);
  app.mount(root); unmounts.push(() => app.unmount());
  const view = () => all(root).find(item => item.props.class === "nx-native-svg")!;
  return { root, props, view, markup: () => String(view().props.innerHTML) };
}

const paths = {
  dark: ["M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"],
  light: ["M12 2v2", "M12 20v2", "m4.93 4.93 1.41 1.41", "m17.66 17.66 1.41 1.41", "M2 12h2", "M20 12h2", "m6.34 17.66-1.41 1.41", "m19.07 4.93-1.41 1.41", "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8"],
  system: ["M3 4h18v12H3z", "M8 20h8", "M12 16v4"],
};
type Mode = keyof typeof paths;
const parentSource = `<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ mode: "dark" | "light" | "system" }>();
const iconPaths = ${JSON.stringify(paths)};
const quickSections = computed(() => [{ key: "preferences", items: [{ key: "theme", icon: props.mode, meta: props.mode }] }]);
</script><template>
<view v-for="section in quickSections" :key="section.key"><view v-for="item in section.items" :key="item.key">
<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor">
<path v-for="path in iconPaths[item.icon]" :key="path" :d="path" /></svg>
<text>{{ item.meta }}</text></view></view></template>`;

function transformedParent(): string {
  vi.stubEnv("UNI_PLATFORM", "app");
  try {
    const transformed = nativeSvgIcons().transform(parentSource, "native-svg-parent.vue");
    expect(transformed?.code).toContain("<NxNativeSvg");
    return transformed!.code;
  } finally {
    vi.unstubAllEnvs();
  }
}

for (const { name, vue } of runtimes) {
  test.each<Mode[]>([["dark", "light", "system", "dark"], ["system", "dark"]])(
    `${name}: parent-rendered theme paths follow %s transitions in the same NativeSvg instance`, async (...modes) => {
      const icon = mount(vue, transformedParent(), { mode: modes[0] });
      const originalView = icon.view();
      for (const mode of modes) {
        icon.props.mode = mode;
        await vue.nextTick();
        expect(all(icon.root).find(item => item.tag === "text")?.text).toBe(mode);
        expect(icon.markup().match(/<path d="([^"]*)"><\/path>/g)).toEqual(paths[mode].map(path => `<path d="${path}"></path>`));
        expect(icon.view()).toBe(originalView);
      }
    });

  test(`${name}: width, height and stroke attrs follow parent updates and removals`, async () => {
    const icon = mount(vue, `<script setup lang="ts">
      defineProps<{ width: number | string; height: number | string; stroke?: string }>();
      </script><template><NxNativeSvg :width="width" :height="height" :stroke="stroke"><path d="M1 2" /></NxNativeSvg></template>`,
      { width: "23", height: 23, stroke: "currentColor" });
    const originalView = icon.view();
    expect(icon.view().props.style).toMatchObject({ width: "23px", height: "23px" });
    Object.assign(icon.props, { width: 32, height: "40", stroke: "var(--v5-brand)" });
    await vue.nextTick();
    expect(icon.view().props.style).toMatchObject({ width: "32px", height: "40px" });
    expect(icon.markup()).toContain('width="32" height="40" stroke="var(--v5-brand)"');
    Object.assign(icon.props, { width: "100%", height: "2rem", stroke: undefined });
    await vue.nextTick();
    expect(icon.view().props.style).toMatchObject({ width: "100%", height: "2rem" });
    expect(icon.markup()).not.toContain("stroke=");
    expect(icon.markup()).toContain('<path d="M1 2"></path>');
    expect(icon.view()).toBe(originalView);
  });

  test(`${name}: static and Fragment children retain escaping and active-content filtering`, () => {
    const icon = mount(vue, `<script setup lang="ts">
      defineProps<{ title: string; link: string; label: string }>();
      </script><template><NxNativeSvg width="16" height="16" :title="title" onload="blocked">
      <g><template v-for="n in 2" :key="n"><path :d="'M' + n" /></template></g>
      <use :href="link" xlink:href="#safe-icon" /><view>ignored</view><text>{{ label }}</text>
      </NxNativeSvg></template>`, { title: 'a"<b&', link: "javascript:blocked", label: "a<b&" });
    expect(icon.markup()).toContain('title="a&quot;&lt;b&amp;"');
    expect(icon.markup()).toContain('<g><path d="M1"></path><path d="M2"></path></g>');
    expect(icon.markup()).toContain('<use xlink:href="#safe-icon"></use>');
    expect(icon.markup()).toContain('<text>a&lt;b&amp;</text>');
    expect(icon.markup()).not.toMatch(/onload|javascript:|ignored|<view/);
  });
}
