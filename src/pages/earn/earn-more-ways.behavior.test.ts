import { computed, reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import { parse } from "@vue/compiler-sfc";
import { initPreContext, preHtml, preJs } from "@dcloudio/uni-cli-shared/dist/preprocess";
import ts from "typescript";
import earnSource from "./earn.vue?raw";
import desktopSource from "@/components/earn/compute-share-entry.vue?raw";

function compile(source: string, dependencies: Record<string, unknown>) {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
}

function fixture(platform: "h5" | "app", nativeAvailable: boolean) {
  initPreContext(platform);
  const { descriptor } = parse(preJs(preHtml(earnSource, "earn.vue"), "earn.vue"));
  const script = descriptor.scriptSetup!.content;
  const config = reactive({
    configStatus: "ready", visible: true,
    isEnabled(flag: string) { return flag === "stakingVisible" && this.visible; },
  });
  const navTo = vi.fn();
  const actions = compile(script.slice(script.indexOf("const config = useConfig();"), script.indexOf("const range = ref")) + `
    return { stakingVisible, goStaking,
      phone: typeof goPhoneCompute === "function" ? goPhoneCompute : goPhoneDownload };`, {
    computed, useConfig: () => config, hasNativeAndroidPhoneRuntime: () => nativeAvailable, navTo,
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

  it("desktop sharing keeps its own flag and download target", () => {
    const cfg = reactive({ configStatus: "ready", visible: true, isEnabled: (key: string) => key === "computeShareEnabled" && cfg.visible });
    const navTo = vi.fn();
    const section = desktopSource.slice(desktopSource.indexOf("const enabled ="), desktopSource.indexOf("const rootStyle:"));
    const entry = compile(section + "return { enabled, goDownload };", { computed, cfg, navTo, trialReservesSlotNow: () => false, app: { activeSlotCount: 0, slotCap: 1 } });
    entry.goDownload();
    expect(navTo).toHaveBeenCalledWith("/pages/compute-share/download");
    for (const [status, visible] of [["loading", true], ["failed", true], ["ready", false]] as const) {
      navTo.mockClear(); cfg.configStatus = status; cfg.visible = visible;
      expect(entry.enabled.value).toBe(false);
      entry.goDownload(); expect(navTo).not.toHaveBeenCalled();
    }
  });
});
