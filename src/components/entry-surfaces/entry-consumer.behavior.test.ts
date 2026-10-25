import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import { all, flush, mountEntry, slot, text } from "@/lib/entry-review.test-support";
import { entrySurfaceCopyFor } from "./entry-surface-copy";
import home from "./entry-surface-home.vue?raw";
import index from "@/pages/entry-surfaces/index.vue?raw";
import signed from "@/pages/entry-surfaces/signed.vue?raw";
import h5 from "@/pages/entry-surfaces/h5.vue?raw";
import white from "@/pages/entry-surfaces/white.vue?raw";

function setup() {
  const locale = Vue.reactive({ code: "zh" });
  const navTo = vi.fn();
  const header = vi.fn();
  const copyModule = { useEntrySurfaceCopy: () => Vue.computed(() => entrySurfaceCopyFor(locale.code)) };
  const dependencies: Record<string, unknown> = {
    vue: Vue, "@/lib/route": { navTo }, "@/components/app-chassis.vue": slot,
    "./entry-surface-copy": copyModule,
    "@/components/entry-surfaces/entry-surface-copy": copyModule,
    "@/composables/use-page-header": { useSetPageHeader: header },
  };
  const script = compileScript(parse(home).descriptor, { id: "entry-consumer", inlineTemplate: true });
  const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = { default: {} as Vue.Component };
  new Function("require", "exports", code)((id: string) => {
    if (!(id in dependencies)) throw new Error(`Unexpected entry import ${id}`);
    return dependencies[id];
  }, exports);
  dependencies["@/components/entry-surfaces/entry-surface-home.vue"] = exports;
  return { locale, navTo, header, dependencies };
}

it.each([
  ["signed", signed, "/", "/pages/me/devices"],
  ["h5", h5, "/pages/earn/earn", "/pages/me/devices"],
  ["white", white, "/", "/pages/me/security"],
] as const)("renders %s as guidance, keeps real destinations and follows locale changes", async (key, source, primary, secondary) => {
  const context = setup();
  const page = mountEntry(source, context.dependencies);
  for (const language of ["zh", "en", "vi"]) {
    context.locale.code = language; await flush();
    const copy = entrySurfaceCopyFor(language);
    const surface = copy.surfaces[key];
    expect(text(page.root)).toContain(surface.body);
    expect(context.header.mock.calls[0][0]().title).toBe(surface.linkLabel);
    expect(page.nodes("entry-metric")).toHaveLength(0);
    expect(text(page.root)).not.toMatch(/已合并|账号级|视觉语言|默认主路由|preview|shell|merged/i);
    expect(all(page.root).filter(n => n.tag === "path").map(n => n.props.stroke)).toEqual(expect.arrayContaining(["var(--v5-brand)", "var(--v5-brand-2)", "var(--v5-tech-cyan)"]));
    const handlers = page.control(surface.primaryLabel)!.props.onKeydown;
    for (const handler of Array.isArray(handlers) ? handlers : [handlers]) handler({ key: "Enter", preventDefault() {} });
    expect(context.navTo).toHaveBeenLastCalledWith(primary);
    page.control(surface.secondaryLabel)!.props.onClick();
    expect(context.navTo).toHaveBeenLastCalledWith(secondary);
    page.control(copy.otherWays)!.props.onClick();
    expect(context.navTo).toHaveBeenLastCalledWith("/pages/entry-surfaces/index");
  }
  page.unmount();
});

it("shows consumer summaries on the index while preserving all three destinations", async () => {
  const context = setup(); const page = mountEntry(index, context.dependencies);
  const routes = ["/pages/entry-surfaces/signed", "/pages/entry-surfaces/h5", "/pages/entry-surfaces/white?entry=white-app"];
  for (const language of ["zh", "en", "vi"]) {
    context.locale.code = language; await flush();
    const copy = entrySurfaceCopyFor(language);
    expect(text(page.root)).toContain(copy.body);
    expect(text(page.root)).not.toContain("/pages/");
    const rows = page.nodes("entry-index__row");
    expect(rows).toHaveLength(3);
    rows.forEach((row, i) => {
      row.props.onClick(); expect(context.navTo).toHaveBeenLastCalledWith(routes[i]);
    });
  }
  page.unmount();
});
