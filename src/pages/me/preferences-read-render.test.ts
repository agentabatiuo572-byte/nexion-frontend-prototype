// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { compile } from "@vue/compiler-dom";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";
import { isMandatoryNotifKind } from "@/store/preferences";
import { initPreContext, preHtml } from "@dcloudio/uni-cli-shared/dist/preprocess";

const template = parse(readFileSync(new URL("./preferences.vue", import.meta.url), "utf8")).descriptor.template!.content;
initPreContext("h5");
const render = new Function("Vue", compile(preHtml(template, "preferences.vue"), { mode: "function", prefixIdentifiers: true }).code)(Vue);
const wrapper = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("section", slots.default?.()) });
const toggleDescriptor = parse(readFileSync(new URL("../../components/me/preference-toggle-row.vue", import.meta.url), "utf8")).descriptor;
const toggleExports = {} as { default: Vue.Component };
new Function("require", "exports", ts.transpileModule(compileScript(toggleDescriptor, { id: "preferences-unknown", inlineTemplate: true }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(() => Vue, toggleExports);
async function show(ready: boolean, error: string | null) {
  const kinds = ["commission", "team", "staking", "market", "genesis", "system"].filter(k => !isMandatoryNotifKind(k as never));
  const app = Vue.createSSRApp({ render, setup: () => ({
    prefs: { remoteReady: ready, error, soundEnabled: true, notifPrefs: Object.fromEntries(kinds.map(k => [k, true])), refreshRemote() {}, toggleSound() {}, toggleNotifKind() {} },
    t: { ui: { retry: "Retry" }, uiChrome: { unavailable: "Unknown" } }, preferenceError: "Read unavailable",
    w: { loading: "Loading settings", feedbackHeading: "Feedback", soundLabel: "Sound", soundHint: "", notifHeading: "Notifications", notifKinds: Object.fromEntries(kinds.map(k => [k, k])), notifFooter: "" },
    notifKinds: kinds, headingStyle: {}, cardStyle: {}, footerStyle: {}, dotStyle: () => ({}),
  }) });
  app.component("AppChassis", wrapper); app.component("SubPageHeader", wrapper); app.component("ToggleRow", toggleExports.default);
  return renderToString(app);
}
describe("notification settings unknown state", () => {
  it("shows loading and only local controls before a confirmed snapshot", async () => {
    const html = await show(false, null);
    expect(html).toContain("Loading settings");
    expect(html.match(/role="switch"/g)).toHaveLength(1);
    expect(html).toContain(">commission<");
    expect(html).not.toContain(">system<");
    expect(html.match(/role="group"/g)).toHaveLength(5);
    expect(html).toContain('aria-label="commission · Unknown"');
  });
  it("shows retry without invented notification values on initial failure", async () => {
    const html = await show(false, "unavailable");
    expect(html).toContain("Read unavailable"); expect(html).toContain("Retry");
    expect(html).not.toContain("Loading settings");
    expect(html.match(/role="switch"/g)).toHaveLength(1);
    expect(html.match(/role="group"/g)).toHaveLength(5);
  });
  it("retains five confirmed remote settings during a later read failure", async () => {
    const html = await show(true, "unavailable");
    expect(html.match(/role="switch"/g)).toHaveLength(6);
    expect(html).toContain("Retry");
  });
});
