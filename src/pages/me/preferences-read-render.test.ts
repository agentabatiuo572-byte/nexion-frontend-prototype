// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { compile } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";
import { isMandatoryNotifKind } from "@/store/preferences";

const template = parse(readFileSync(new URL("./preferences.vue", import.meta.url), "utf8")).descriptor.template!.content;
const render = new Function("Vue", compile(template, { mode: "function", prefixIdentifiers: true }).code)(Vue);
const wrapper = Vue.defineComponent({ setup: (_, { slots }) => () => Vue.h("section", slots.default?.()) });
const toggle = Vue.defineComponent({ props: ["label", "value"], setup: props => () => Vue.h("button", { role: "switch", "aria-checked": String(props.value) }, String(props.label)) });
async function show(ready: boolean, error: string | null) {
  const kinds = ["commission", "team", "staking", "market", "genesis", "system"];
  const app = Vue.createSSRApp({ render, setup: () => ({
    prefs: { remoteReady: ready, error, soundEnabled: false, hapticsEnabled: true, notifPrefs: Object.fromEntries(kinds.map(k => [k, true])), refreshRemote() {}, toggleSound() {}, toggleHaptics() {}, toggleNotifKind() {} },
    t: { ui: { retry: "Retry" } }, preferenceError: "Read unavailable",
    w: { loading: "Loading settings", feedbackHeading: "Feedback", soundLabel: "Sound", soundHint: "", hapticsLabel: "Haptics", hapticsHint: "", notifHeading: "Notifications", notifKinds: Object.fromEntries(kinds.map(k => [k, k])), notifFooter: "" },
    notifKinds: kinds, isMandatoryNotifKind, headingStyle: {}, cardStyle: {}, footerStyle: {}, dotStyle: () => ({}),
  }) });
  app.component("AppChassis", wrapper); app.component("SubPageHeader", wrapper); app.component("ToggleRow", toggle);
  return renderToString(app);
}
describe("notification settings unknown state", () => {
  it("shows loading and only local controls before a confirmed snapshot", async () => {
    const html = await show(false, null);
    expect(html).toContain("Loading settings");
    expect(html.match(/role="switch"/g)).toHaveLength(2);
    expect(html).not.toContain(">commission<");
  });
  it("shows retry without invented notification values on initial failure", async () => {
    const html = await show(false, "unavailable");
    expect(html).toContain("Read unavailable"); expect(html).toContain("Retry");
    expect(html).not.toContain("Loading settings");
    expect(html.match(/role="switch"/g)).toHaveLength(2);
  });
  it("retains six confirmed remote settings during a later read failure", async () => {
    const html = await show(true, "unavailable");
    expect(html.match(/role="switch"/g)).toHaveLength(8);
    expect(html).toContain("Retry");
  });
});
