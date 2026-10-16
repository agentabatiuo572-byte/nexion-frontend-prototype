// @ts-expect-error Node-only SFC harness.
import { readFileSync } from "node:fs";
// @ts-expect-error Node-only platform compiler.
import { createRequire } from "node:module";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import * as vue from "vue";
import * as reader from "@/lib/native-phone-gpu";
import { createNativeGpuRequest } from "@/lib/native-gpu-request";
const require = createRequire(import.meta.url);
const { initPreContext, preHtml, preJs } = require("@dcloudio/uni-cli-shared");
const source = readFileSync(new URL("./native-gpu-observer.vue", import.meta.url), "utf8");
function compile(script: string, modules: Record<string, unknown>) {
  const exports: any = {};
  const code = ts.transpileModule(script, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function("require", "exports", code)((id: string) => modules[id], exports);
  return exports.default;
}
describe("App render-to-logic GPU bridge", () => {
  it("runs the real reader and options callback and resolves only this observation", async () => {
    const gl = { getExtension: (name: string) => name === "WEBGL_debug_renderer_info"
      ? { UNMASKED_RENDERER_WEBGL: 123 } : { loseContext: vi.fn() }, getParameter: () => "Actual Adreno renderer" };
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => gl }) });
    try {
      const logic = compile(source.split('<script lang="ts">')[1].split("</script>")[0], { vue });
      const render = compile(source.split('<script module="gpuView" lang="renderjs">')[1].split("</script>")[0], { "@/lib/native-phone-gpu": reader });
      const owner = { callMethod: vi.fn((name: string, value: unknown) => logic.methods[name].call({ $emit: (_event: string, body: unknown) => request.receive(body) }, value)) };
      const request = createNativeGpuRequest(id => render.methods.observe(id, 0, owner));
      expect(await request.read()).toEqual({ status: "observed", renderer: "Actual Adreno renderer" });
      expect(owner.callMethod).toHaveBeenCalledExactlyOnceWith("receiveGpuObservation", { id: 1, status: "observed", renderer: "Actual Adreno renderer" });
      render.methods.observe(0, undefined, owner); render.methods.observe(1, 1, owner);
      expect(owner.callMethod).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it.each(["connect", "estimator"])("keeps %s observer out of H5 while App has a bound response handler", name => {
    const page = readFileSync(new URL(`../pages/onboarding/${name}.vue`, import.meta.url), "utf8");
    initPreContext("app-plus");
    const app = preJs(preHtml(page, `${name}.vue`), `${name}.vue`);
    expect(app).toContain('<NativeGpuObserver :request="gpuRequest" @observation="gpuReader.receive" />');
    expect(app).toContain("await gpuReader.read()");
    initPreContext("h5");
    const h5 = preJs(preHtml(page, `${name}.vue`), `${name}.vue`);
    expect(h5).not.toContain("NativeGpuObserver"); expect(h5).not.toContain("gpuReader");
  });
});
