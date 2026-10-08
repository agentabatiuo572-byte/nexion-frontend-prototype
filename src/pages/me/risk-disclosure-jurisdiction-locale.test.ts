import { computed, reactive, ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, describe, expect, it, vi } from "vitest";
import pageSource from "./risk-disclosure.vue?raw";
import { createRiskDisclosureApi, type RiskDisclosureCurrent } from "@/api/risk-disclosure-api";
import { fmt } from "@/i18n/format";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { zh } from "@/i18n/messages/zh";
import { resolveRiskDisclosureDisplayLanguage } from "@/lib/risk-disclosure-language";
import { useT } from "@/i18n/use-t";
import { useLocaleStore } from "@/store/locale";
import { useI18nRuntime } from "@/store/i18n-runtime";

const bundles = vi.hoisted(() => ({ all: vi.fn() }));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true, i18nApi: { all: bundles.all } }));
afterEach(() => { vi.unstubAllGlobals(); });

const dictionaries = { zh, en, vi: vietnamese };
type Locale = keyof typeof dictionaries;
const snapshot: RiskDisclosureCurrent = {
  source: "server", sourceEnvironment: "PRODUCTION", jurisdiction: "CN", jurisdictionName: "中国大陆",
  version: "v2", languageScope: "zh+vi+en", effectiveDate: "2026-09-24",
  acknowledged: false, acknowledgedAt: null, acknowledgmentToken: "fixture-read-token",
  acknowledgmentTokenExpiresAt: "2026-10-08T12:00:00Z", minimumReadingSeconds: 30,
  chapters: Array.from({ length: 7 }, (_, index) => ({
    no: String(index + 1).padStart(2, "0"), zh: "标题", vi: "Tiêu đề", en: "Title",
    zhBody: "正文", viBody: "Nội dung", enBody: "Body",
  })),
};

function actualPageContext(code: Locale, current: RiskDisclosureCurrent | null = snapshot,
  live?: { locale: { code: string }; w: { value: typeof en.riskDisclosure } }) {
  const locale = live?.locale ?? reactive({ code });
  const disclosure = ref(current);
  const w = live?.w ?? computed(() => dictionaries[locale.code as Locale].riskDisclosure);
  const start = pageSource.indexOf("const displayLanguage = computed");
  const end = pageSource.indexOf("const documentIdentity = computed", start);
  if (start < 0 || end < start) throw new Error("Actual risk disclosure context source required");
  const bindings = { computed, locale, disclosure, w, fmt, resolveRiskDisclosureDisplayLanguage };
  const context = new Function(...Object.keys(bindings), pageSource.slice(start, end)
    + ";return disclosureContext;")(...Object.values(bindings)) as { value: string };
  return { context, locale, disclosure };
}

describe("risk disclosure jurisdiction display", () => {
  it.each([
    ["zh", "中国大陆 · v2 · 生效日期 2026-09-24"],
    ["en", "Mainland China · v2 · Effective 2026-09-24"],
    ["vi", "Trung Quốc đại lục · v2 · Hiệu lực 2026-09-24"],
  ] as const)("shows CN in the active %s interface language", (locale, expected) => {
    expect(actualPageContext(locale).context.value).toBe(expected);
  });

  it("uses the current language when a disclosure response arrives after a language switch", async () => {
    const page = actualPageContext("en", null);
    let resolve!: (value: RiskDisclosureCurrent) => void;
    const response = new Promise<RiskDisclosureCurrent>((done) => { resolve = done; });
    const loading = response.then((value) => { page.disclosure.value = value; });
    expect(page.context.value).toBe("");
    page.locale.code = "vi";
    resolve(snapshot); await loading;
    expect(page.context.value).toBe("Trung Quốc đại lục · v2 · Hiệu lực 2026-09-24");
    page.locale.code = "zh";
    expect(page.context.value).toBe("中国大陆 · v2 · 生效日期 2026-09-24");
    page.locale.code = "en";
    expect(page.context.value).toBe("Mainland China · v2 · Effective 2026-09-24");
  });

  it("does not replace the active Vietnamese label when an English language bundle arrives late", async () => {
    setActivePinia(createPinia());
    vi.stubGlobal("uni", { getStorageSync: () => "", setStorageSync: vi.fn(), getSystemInfoSync: () => ({ language: "en" }) });
    const locale = useLocaleStore(), runtime = useI18nRuntime(), t = useT();
    const page = actualPageContext("en", snapshot, { locale, w: computed(() => t.value.riskDisclosure) });
    let resolve!: (value: { messages: Record<string, string> }) => void;
    bundles.all.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const loading = runtime.refresh("en", true);
    expect(page.context.value).toBe("Mainland China · v2 · Effective 2026-09-24");
    locale.setLocale("vi");
    resolve({ messages: { "riskDisclosure.mainlandChina": "Mainland China (published label)" } });
    await loading;
    expect(page.context.value).toBe("Trung Quốc đại lục · v2 · Hiệu lực 2026-09-24");
    expect(locale.code).toBe("vi");
    locale.setLocale("en");
    expect(page.context.value).toBe("Mainland China (published label) · v2 · Effective 2026-09-24");
  });

  it.each(["VN", "UNKNOWN", "__proto__"])("keeps the server name for unmapped display code %s", (jurisdiction) => {
    const page = actualPageContext("en", { ...snapshot, jurisdiction, jurisdictionName: "Published jurisdiction name" });
    expect(page.context.value).toBe("Published jurisdiction name · v2 · Effective 2026-09-24");
    expect(page.disclosure.value?.jurisdiction).toBe(jurisdiction);
  });

  it("keeps display translation separate from the acknowledgment jurisdiction/version/token", async () => {
    const before = structuredClone(snapshot);
    const page = actualPageContext("en");
    expect(page.context.value).toContain("Mainland China");
    const request = vi.fn().mockResolvedValue({
      ...snapshot, acknowledged: true, acknowledgedAt: "2026-10-08T11:00:00Z",
      acknowledgmentToken: null, acknowledgmentTokenExpiresAt: null,
    });
    await createRiskDisclosureApi({ request } as never).acknowledge(page.disclosure.value!);
    expect(request).toHaveBeenCalledExactlyOnceWith({
      method: "POST", path: "/api/legal/risk-disclosure/acknowledgment",
      body: { jurisdiction: "CN", version: "v2", acknowledgmentToken: "fixture-read-token", confirmed: true },
    });
    expect(page.disclosure.value).toEqual(before);
    expect(snapshot).toEqual(before);
  });
});
