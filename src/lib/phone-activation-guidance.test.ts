// @ts-expect-error This platform compilation contract runs in Node.
import { readFileSync } from "node:fs";
// @ts-expect-error This platform compilation contract runs in Node.
import { createRequire } from "node:module";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import type { resolvePhoneActivationGuidance } from "./phone-activation-guidance";

const require = createRequire(import.meta.url);
const { initPreContext, preJs } = require("@dcloudio/uni-cli-shared");
function compiledFunctions(platform: "h5" | "app-plus") {
  initPreContext(platform);
  const load = (name: string) => {
    const source = preJs(readFileSync(new URL(`./${name}.ts`, import.meta.url), "utf8"), `${name}.ts`);
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    const exports: Record<string, any> = {};
    new Function("exports", compiled)(exports);
    return exports;
  };
  return {
    resolve: load("phone-activation-guidance").resolvePhoneActivationGuidance as typeof resolvePhoneActivationGuidance,
    available: load("native-phone-runtime").hasNativeAndroidPhoneRuntime as () => boolean,
  };
}
afterEach(() => vi.unstubAllGlobals());

describe.each([["en", en], ["zh", zh], ["vi", vietnamese]] as const)("%s phone activation guidance after real UniApp preprocessing", (_locale, messages) => {
  const copy = messages.myDevices;
  it("keeps H5 browser guidance even when a native Android bridge or true capability flag is injected", () => {
    vi.stubGlobal("plus", { os: { name: "Android" } });
    const platform = compiledFunctions("h5");
    expect(platform.available()).toBe(false);
    for (const nativeAvailable of [false, true]) {
      expect(platform.resolve(nativeAvailable, copy)).toEqual({ title: copy.phoneActivationAppOnlyTitle, body: copy.phoneActivationAppOnlyBody });
    }
  });
  it("retains Android activation guidance without browser or download copy", () => {
    vi.stubGlobal("plus", { os: { name: "Android" } });
    const platform = compiledFunctions("app-plus");
    expect(platform.available()).toBe(true);
    expect(platform.resolve(platform.available(), copy)).toEqual({ title: copy.phoneActivationTitle, body: copy.phoneActivationBody });
  });
  it("gives unsupported native devices their own guidance instead of the H5 instruction", () => {
    vi.stubGlobal("plus", { os: { name: "iOS" } });
    const platform = compiledFunctions("app-plus");
    expect(platform.available()).toBe(false);
    const guidance = platform.resolve(platform.available(), copy);
    expect(guidance).toEqual({ title: copy.phoneActivationNativeUnavailableTitle, body: copy.phoneActivationNativeUnavailableBody });
    expect(guidance.title).not.toBe(copy.phoneActivationAppOnlyTitle);
    expect(guidance.body).not.toBe(copy.phoneActivationAppOnlyBody);
    expect(`${guidance.title} ${guidance.body}`).not.toMatch(/browser|download|sign in|浏览器|下载|登录|Trình duyệt|đăng nhập|Tải APP/i);
  });
});
