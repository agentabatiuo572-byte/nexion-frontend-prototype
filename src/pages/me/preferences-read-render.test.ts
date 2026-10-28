// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { compile } from "@vue/compiler-dom";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";
import { isMandatoryNotifKind } from "@/store/preferences";

const template = parse(readFileSync(new URL("./preferences.vue", import.meta.url), "utf8")).descriptor.template!.content;
const render = new Function("Vue", compile(template, { mode: "function", prefixIdentifiers: true }).code)(Vue);
const wrapper = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("section", slots.default?.()) });
const toggleDescriptor = parse(readFileSync(new URL("../../components/me/preference-toggle-row.vue", import.meta.url), "utf8")).descriptor;
const toggleExports = {} as { default: Vue.Component };
new Function("require", "exports", ts.transpileModule(compileScript(toggleDescriptor, { id: "preferences-unknown", inlineTemplate: true }).content,
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(() => Vue, toggleExports);
async function show(ready: boolean, error: string | null, notificationError: string | null = null, clearingRead = false) {
  const kinds = ["commission", "team", "staking", "market", "genesis", "system"];
  const app = Vue.createSSRApp({ render, setup: () => ({
    prefs: { remoteReady: ready, error, soundEnabled: false, hapticsEnabled: true, notifPrefs: Object.fromEntries(kinds.map(k => [k, true])), refreshRemote() {}, toggleSound() {}, toggleHaptics() {}, toggleNotifKind() {} },
    t: { ui: { retry: "Retry" }, uiChrome: { unavailable: "Unknown" }, notifs: { drawerTitle: "Messages", clearReadAria: "Clear read", loadFailed: "Messages unavailable" }, help: { loadingMore: "Loading messages" } }, preferenceError: "Read unavailable",
    notifs: { loading: false, error: notificationError }, clearingRead, confirmClearRead() {}, refreshNotifications() {},
    w: { loading: "Loading settings", feedbackHeading: "Feedback", soundLabel: "Sound", soundHint: "", hapticsLabel: "Haptics", hapticsHint: "", notifHeading: "Notifications", notifKinds: Object.fromEntries(kinds.map(k => [k, k])), notifFooter: "" },
    notifKinds: kinds, isMandatoryNotifKind, headingStyle: {}, cardStyle: {}, footerStyle: {}, dotStyle: () => ({}),
  }) });
  app.component("AppChassis", wrapper); app.component("SubPageHeader", wrapper); app.component("ToggleRow", toggleExports.default);
  app.component("LiquidGlass", { render: () => null });
  return renderToString(app);
}
describe("notification settings unknown state", () => {
  it("shows loading and only local controls before a confirmed snapshot", async () => {
    const html = await show(false, null);
    expect(html).toContain("Loading settings");
    expect(html.match(/role="switch"/g)).toHaveLength(2);
    expect(html).toContain(">commission<");
    expect(html.match(/role="group"/g)).toHaveLength(6);
    expect(html).toContain('aria-label="commission · Unknown"');
  });
  it("shows retry without invented notification values on initial failure", async () => {
    const html = await show(false, "unavailable");
    expect(html).toContain("Read unavailable"); expect(html).toContain("Retry");
    expect(html).not.toContain("Loading settings");
    expect(html.match(/role="switch"/g)).toHaveLength(2);
    expect(html.match(/role="group"/g)).toHaveLength(6);
  });
  it("retains six confirmed remote settings during a later read failure", async () => {
    const html = await show(true, "unavailable");
    expect(html.match(/role="switch"/g)).toHaveLength(8);
    expect(html).toContain("Retry");
  });
  it("keeps message clearing reachable with its own error and retry independently of preference errors", async () => {
    const html = await show(true, "unavailable", "NOTIFICATION_UPDATE_FAILED");
    expect(html).toContain('aria-label="Clear read"');
    expect(html).toContain('data-testid="notification-preferences-error"');
    expect(html).toContain('data-testid="notification-clear-error"');
    expect(html).toContain('Messages unavailable'); expect(html).not.toContain('NOTIFICATION_UPDATE_FAILED');
    expect(html.match(/aria-label="Retry"/g)).toHaveLength(2);
    expect(html.match(/role="switch"/g)).toHaveLength(8);
  });
  it("removes the clear action from keyboard activation while its confirmation or mutation is pending", async () => {
    const html = await show(true, null, null, true);
    expect(html).toMatch(/class="family-control notification-clear-read"[^>]*tabindex="-1"[^>]*aria-disabled="true"/);
  });
});
