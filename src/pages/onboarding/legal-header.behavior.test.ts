import { afterEach, expect, it, vi } from "vitest";
import { defineComponent, h, reactive, ref } from "vue";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { LOCALES } from "@/i18n";
import { platformDisplayText } from "@/lib/brand-copy";
import { resolvePrivacyReturn } from "@/lib/privacy-return";
import * as gate from "@/lib/legal-terms-gate";
import { createLegalTermsRequestFence } from "@/lib/legal-terms-request-fence";
import { formatLegalEffectiveDate } from "@/lib/legal-effective-date";
import { flush, mountEntry, slot, text } from "@/lib/entry-review.test-support";
import terms from "./terms.vue?raw";
import privacy from "./privacy.vue?raw";

const unmounts: Array<() => void> = [];
afterEach(() => { unmounts.splice(0).forEach(fn => fn()); vi.unstubAllGlobals(); });
function mount(kind: "terms" | "privacy", code: "en" | "zh" | "vi", brand = "UVEL / UVT") {
  let load!: (query: Record<string, string>) => void;
  const locale = reactive({ code, setLocale: vi.fn() }), navBack = vi.fn(), navTo = vi.fn();
  const blocked = ref(false), acknowledge = vi.fn();
  const current = vi.fn(async () => kind === "privacy"
    ? { version: "v7", locale: code, hero: `${brand} Policy sample`, sections: [{ id: "sample", title: "Privacy sample", body: `${brand} Published text` }] }
    : { source: "server", sourceEnvironment: "PRODUCTION", runId: "", requestedLocale: code, resolvedLocale: code,
      requestedJurisdiction: "GLOBAL", resolvedJurisdiction: "GLOBAL", version: "v7", effectiveAt: "2026-10-25T00:00:00Z",
      title: `${brand} Terms sample`, summary: "Published summary", sections: [{ key: "sample", title: `${brand} Terms sample`, body: `${brand} Published text`, sortOrder: 0 }], acknowledged: false });
  const headerProps: any[] = [];
  const header = { default: defineComponent({ props: ["back", "backAction", "title", "plain", "design"], setup: props => () => {
    headerProps.push(props);
    return h("view", { class: "header-back", role: "button", onClick: props.backAction }, props.title);
  } }) };
  const p = mountEntry(kind === "terms" ? terms : privacy, {
    "@dcloudio/uni-app": { onLoad: (fn: typeof load) => { load = fn; }, onBackPress: vi.fn(), onShow: vi.fn(), onHide: vi.fn() },
    "@/components/device/standalone-page-shell.vue": slot, "@/components/sub-page-header.vue": header,
    "@/lib/brand-copy": { platformDisplayText }, "@/i18n/use-t": { useT: () => ref({ en, zh, vi: vietnamese }[code]) },
    "@/store/locale": { useLocaleStore: () => locale }, "@/i18n": { LOCALES },
    "@/i18n/format": { dateLocale: () => ({ en: "en-US", zh: "zh-CN", vi: "vi-VN" }[locale.code]) },
    "@/lib/legal-effective-date": { formatLegalEffectiveDate },
    "@/lib/route": { navBack, navTo }, "@/lib/privacy-return": { resolvePrivacyReturn },
    "@/api/runtime": { privacyPolicyApi: { current }, legalTermsApi: { current, acknowledge }, remoteApiEnabled: true,
      sessionVault: { read: () => ({ accessToken: "session", user: { userId: 1 } }), revision: () => 1 } },
    "@/lib/legal-terms-gate": { ...gate, shouldBlockLegalTermsExit: () => blocked.value },
    "@/lib/locale-profile-hydration": { pendingProfileLocaleHydration: () => null, isProfileLocaleHydrationError: () => false },
    "@/lib/locale-profile-sync-runtime": { retryCurrentProfileLocale: vi.fn() },
    "@/api/order-api": { captureRuntimeRevision: () => ({ runId: "" }) },
    "@/lib/legal-terms-request-fence": { createLegalTermsRequestFence },
  });
  unmounts.push(p.unmount);
  return { ...p, load: (query: Record<string, string>) => load(query), headerProps, blocked, navBack, navTo, current, acknowledge };
}

it.each(["en", "zh", "vi"] as const)("privacy %s keeps the validated attribution return through the common header", async locale => {
  const p = mount("privacy", locale); p.load({ return: "/pages/ref/code?code=UVELDEMO" }); await flush();
  expect(text(p.root)).toContain("Policy sample");
  expect(p.headerProps.at(-1)).toMatchObject({ back: "/pages/ref/code?code=UVELDEMO", plain: "", design: "" });
  p.nodes("header-back")[0].props.onClick();
  expect(p.navBack).toHaveBeenCalledWith("/pages/ref/code?code=UVELDEMO");
});

it.each(["en", "zh", "vi"] as const)("terms %s localizes the same snapshot date and retains the existing exit decision", async locale => {
  const p = mount("terms", locale); p.load({ return: "/pages/trust/trust" }); await flush();
  const date = formatLegalEffectiveDate("2026-10-25", { en: "en-US", zh: "zh-CN", vi: "vi-VN" }[locale]);
  expect(text(p.root)).toContain(`${date} · v7`); expect(text(p.root)).not.toContain("2026-10-25T");
  vi.stubGlobal("uni", { showToast: vi.fn() });
  p.blocked.value = true; await flush(); p.nodes("header-back")[0].props.onClick();
  expect(p.navTo).not.toHaveBeenCalled(); expect(p.navBack).not.toHaveBeenCalled();
  p.blocked.value = false; await flush(); p.nodes("header-back")[0].props.onClick();
  expect(p.navTo).toHaveBeenCalledWith("/pages/trust/trust");
  expect(p.acknowledge).not.toHaveBeenCalled();
});


it.each(["terms", "privacy"] as const)("%s renders published legacy wording exactly", async kind => {
  const p = mount(kind, "en", "NexGrid / NEX"); p.load({}); await flush();
  expect(text(p.root)).toContain("NexGrid / NEX");
  expect(text(p.root)).not.toContain("UVEL / UVT");
});
