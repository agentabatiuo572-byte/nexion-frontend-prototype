import { describe, expect, it } from "vitest";

const app = (import.meta.glob("./App.vue", { query: "?raw", import: "default", eager: true })["./App.vue"] ?? "") as string;
const accountScope = (import.meta.glob("./lib/account-scope.ts", { query: "?raw", import: "default", eager: true })["./lib/account-scope.ts"] ?? "") as string;

describe("operator configuration refresh lifecycle", () => {
  it("force-refreshes E2, H1 and I6 authority when the App returns foreground", () => {
    const onShow = app.slice(app.indexOf("onShow(() =>"), app.indexOf("onHide(() =>"));
    expect(onShow).toContain("refreshEarnConfig()");
    expect(onShow).toContain("refreshServerProductPhase(true)");
    expect(onShow).toContain("useI18nRuntime().refresh(useLocaleStore().code, true)");
  });

  it("loads H1 authority immediately after an authenticated account rebind", () => {
    expect(accountScope).toContain('if (remoteApiEnabled && accountKey !== "default")');
    expect(accountScope).toContain("void refreshServerProductPhase(true)");
  });
});
