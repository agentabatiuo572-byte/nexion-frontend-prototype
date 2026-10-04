import { ref, watch } from "vue";
import { expect, test, vi } from "vitest";
import ts from "typescript";
import source from "../App.vue?raw";

function setup() {
  const start = source.indexOf("watch(() => useLocaleStore().code");
  const end = source.indexOf('}, { flush: "sync" });', start) + '}, { flush: "sync" });'.length;
  const locale = ref("en");
  const state = { visible: true, authenticated: true, route: "pages/me/language" };
  const schedule = vi.fn();
  const stopBusinessLoops = vi.fn();
  let stopWatch = () => {};
  const script = ts.transpileModule(source.slice(start, end), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const controls = new Function("watch", "useLocaleStore", "remoteApiEnabled", "canRefreshRemoteAccount", "useAuth",
    "readCurrentRoute", "isStaticReviewRoute", "scheduleLegalTermsGate", "hasPendingLegalTermsRequirement",
    "stopBusinessLoops", "state", `let lastLegalTermsGateRoute = '', lastLegalTermsGateLocale = '';
      let questTimer = 1; ${script}
      return { setVisible: (visible) => { questTimer = visible ? 1 : undefined; } };`)(
    (...args: Parameters<typeof watch>) => { stopWatch = watch(...args); },
    () => ({ get code() { return locale.value; } }), true, () => state.authenticated, () => ({}),
    () => state.route, () => false, schedule, () => true, stopBusinessLoops, state,
  ) as { setVisible(visible: boolean): void };
  return { locale, state, schedule, stopBusinessLoops, ...controls, stop: () => stopWatch() };
}

test("same-page language selection synchronously rechecks Terms and stops business activity", () => {
  const h = setup();
  h.locale.value = "zh";
  expect(h.schedule).toHaveBeenCalledWith("/pages/me/language");
  expect(h.stopBusinessLoops).toHaveBeenCalledOnce();
  h.stop();
});

test("background and unauthenticated language changes do not start protected reads", () => {
  const h = setup();
  h.setVisible(false);
  h.locale.value = "zh";
  h.setVisible(true);
  h.state.authenticated = false;
  h.locale.value = "vi";
  expect(h.schedule).not.toHaveBeenCalled();
  h.stop();
});
