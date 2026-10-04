import * as Vue from "vue";
import type { Component } from "vue";
import { afterEach, expect, test, vi } from "vitest";
import { compileScript, parse } from "@vue/compiler-sfc";
import { initPreContext, preHtml, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import chartSource from "./nex-chart.vue?raw";
import nativeSource from "../native-svg.vue?raw";
import { svgMarkup } from "@/lib/native-svg-markup";

// Use UniApp's installed conditional preprocessor, then execute the production
// SFC script/template and NativeSvg serializer through the real Vue renderer.
function compile(source: string, filename: string, dependencies: Record<string, unknown>): Component {
  const { descriptor } = parse(preJs(preHtml(source, filename), filename), { filename });
  const script = compileScript(descriptor, { id: filename, inlineTemplate: true });
  const code = ts.transpileModule(script.content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = { default: {} as Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected production import: ${id}`);
    return dependencies[id];
  }, exports);
  return exports.default;
}

type HostNode = { type: string; text: string; parent: HostNode | null; children: HostNode[]; props: Record<string, unknown> };
const node = (type: string, text = ""): HostNode => ({ type, text, parent: null, children: [], props: {} });
const renderer = Vue.createRenderer<HostNode, HostNode>({
  createElement: type => node(type), createText: text => node("text", text), createComment: () => node("comment"),
  setText: (target, text) => { target.text = text; },
  setElementText: (target, text) => { target.text = text; target.children = []; },
  patchProp: (target, key, _previous, value) => { target.props[key] = value; },
  parentNode: child => child.parent,
  nextSibling: child => child.parent?.children[child.parent.children.indexOf(child) + 1] ?? null,
  insert: (child, parent, anchor) => {
    child.parent = parent;
    const index = anchor ? parent.children.indexOf(anchor) : -1;
    if (index < 0) parent.children.push(child); else parent.children.splice(index, 0, child);
  },
  remove: child => { if (child.parent) child.parent.children = child.parent.children.filter(entry => entry !== child); },
});
const descendants = (target: HostNode): HostNode[] => [target, ...target.children.flatMap(descendants)];
const unmounts: Array<() => void> = [];

function mount(platform: "app" | "h5", data: number[], up: boolean, attrs: Record<string, unknown> = {}, count = 1) {
  initPreContext(platform);
  const NativeSvg = compile(nativeSource, "native-svg.vue", { vue: Vue, "@/lib/native-svg-markup": { svgMarkup } });
  const NexChart = compile(chartSource, "nex-chart.vue", {
    vue: Vue, "@/components/native-svg.vue": { default: NativeSvg },
  });
  const props = Vue.reactive({ data, up });
  const root = node("root");
  const app = renderer.createApp({ render: () => Vue.h("charts", Array.from({ length: count }, () => Vue.h(NexChart, { ...attrs, ...props }))) });
  app.mount(root); unmounts.push(() => app.unmount());
  const nativeViews = () => descendants(root).filter(entry => entry.type === "view" && typeof entry.props.innerHTML === "string");
  const markup = () => {
    expect(nativeViews()).toHaveLength(count);
    return String(nativeViews()[0].props.innerHTML);
  };
  return { root, props, nativeViews, markup };
}

function attribute(markup: string, tag: string, name: string): string | undefined {
  return markup.match(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`))?.[1];
}

afterEach(() => { unmounts.splice(0).forEach(unmount => unmount()); vi.restoreAllMocks(); });

const curves = [
  { label: "two increasing prices", data: [1, 2], up: true, points: "0.0,115.0 360.0,5.0" },
  { label: "two decreasing prices", data: [2, 1], up: false, points: "0.0,5.0 360.0,115.0" },
  { label: "equal prices", data: [1, 1, 1], up: true, points: "0.0,115.0 180.0,115.0 360.0,115.0" },
  { label: "multiple prices", data: [1, 2, 1], up: false, points: "0.0,115.0 180.0,5.0 360.0,115.0" },
];

test.each(curves)("APP-PLUS renders $label through the supported view markup path", ({ data, up, points }) => {
  const chart = mount("app", data, up);
  const markup = chart.markup();
  const color = up ? "var(--v5-brand)" : "var(--v5-brand-2)";
  expect(descendants(chart.root).some(entry => entry.type === "svg")).toBe(false);
  expect(markup).toContain('xmlns="http://www.w3.org/2000/svg"');
  expect(attribute(markup, "svg", "width")).toBe("100%");
  expect(attribute(markup, "svg", "height")).toBe("120");
  expect(attribute(markup, "svg", "viewBox")).toBe("0 0 360 120");
  expect(attribute(markup, "svg", "preserveAspectRatio")).toBe("none");
  expect(chart.nativeViews()[0].props.style).toMatchObject({ width: "100%", height: "120px" });
  expect(attribute(markup, "polyline", "points")).toBe(points);
  expect(attribute(markup, "polygon", "points")).toBe(`0,120 ${points} 360,120`);
  expect(attribute(markup, "polyline", "stroke")).toBe(color);
  expect(attribute(markup, "stop", "stop-color")).toBe(color);
  expect(attribute(markup, "polyline", "stroke-width")).toBe("1.6");
  expect(attribute(markup, "stop", "stop-opacity")).toBe("0.30");
  expect(markup).toContain('offset="100%" stop-color="' + color + '" stop-opacity="0"');
  const id = attribute(markup, "linearGradient", "id");
  expect(id).toMatch(/^nex-area-[a-z0-9]+$/);
  expect(attribute(markup, "polygon", "fill")).toBe(`url(#${id})`);
});

test.each(curves)("H5 retains its existing SVG geometry for $label", ({ data, up, points }) => {
  const chart = mount("h5", data, up);
  expect(chart.nativeViews()).toHaveLength(0);
  const children = descendants(chart.root);
  const svg = children.find(entry => entry.type === "svg")!;
  expect(svg.props).toMatchObject({ width: "100%", height: 120, viewBox: "0 0 360 120", preserveAspectRatio: "none" });
  expect(children.find(entry => entry.type === "polyline")?.props).toMatchObject({ points, stroke: up ? "var(--v5-brand)" : "var(--v5-brand-2)" });
  expect(children.find(entry => entry.type === "polygon")?.props.points).toBe(`0,120 ${points} 360,120`);
});

test("APP-PLUS follows changed range data and direction without replacing its gradient", async () => {
  const chart = mount("app", [1, 2], true);
  const id = attribute(chart.markup(), "linearGradient", "id");
  chart.props.data = [3, 2, 1]; chart.props.up = false;
  await Vue.nextTick();
  expect(attribute(chart.markup(), "polyline", "points")).toBe("0.0,5.0 180.0,60.0 360.0,115.0");
  expect(attribute(chart.markup(), "polyline", "stroke")).toBe("var(--v5-brand-2)");
  expect(attribute(chart.markup(), "stop", "stop-color")).toBe("var(--v5-brand-2)");
  expect(attribute(chart.markup(), "linearGradient", "id")).toBe(id);
  chart.props.data[1] = 3;
  await Vue.nextTick();
  expect(attribute(chart.markup(), "polyline", "points")).toBe("0.0,5.0 180.0,5.0 360.0,115.0");
});

test("APP-PLUS keeps each mounted chart's area gradient local to that instance", () => {
  vi.spyOn(Math, "random").mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);
  const chart = mount("app", [1, 2], true, {}, 2);
  expect(chart.nativeViews()).toHaveLength(2);
  const ids = chart.nativeViews().map(view => attribute(String(view.props.innerHTML), "linearGradient", "id"));
  expect(ids[0]).toBeDefined(); expect(ids[1]).toBeDefined(); expect(ids[0]).not.toBe(ids[1]);
  chart.nativeViews().forEach((view, index) => {
    expect(attribute(String(view.props.innerHTML), "polygon", "fill")).toBe(`url(#${ids[index]})`);
  });
});

test("APP-PLUS retains the real NativeSvg attribute escaping and active-content guard", () => {
  const chart = mount("app", [1, 2], true, {
    title: '"><script>alert("chart")</script>&', onload: "alert(1)", href: "javascript:alert(1)",
  });
  const markup = chart.markup();
  expect(markup).toContain('title="&quot;&gt;&lt;script&gt;alert(&quot;chart&quot;)&lt;/script&gt;&amp;"');
  expect(markup).not.toMatch(/<script|onload=|href=|javascript:/);
  expect(attribute(markup, "polyline", "points")).toBe("0.0,115.0 360.0,5.0");
});
