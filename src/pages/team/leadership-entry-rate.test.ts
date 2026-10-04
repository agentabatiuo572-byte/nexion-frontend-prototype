// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { computed, ref } from "vue";
import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";

describe("leadership entry captions follow the approved pool ratio", () => {
  for (const route of ["./team.vue", "../../components/home/leadership-pool-card.vue"]) {
    const source = readFileSync(new URL(route, import.meta.url), "utf8");
    const binding = source.match(/const poolThisWeekText = computed\(\(\) => \{[\s\S]*?\n\}\);/)?.[0];
    if (!binding) throw new Error(`Missing entry rate binding: ${route}`);
    const build = new Function("computed", "remoteApiEnabled", "remotePool", "fmt", "t", "dateLocale", `${binding}; return poolThisWeekText;`);
    it(`connects the rate caption to the visible entry in ${route}`, () => {
      expect(source).toContain(route === "./team.vue" ? ": poolThisWeekText.value," : "{{ poolThisWeekText }}");
    });
    for (const [locale, dictionary] of [["en-US", en], ["zh-CN", zh], ["vi-VN", vi]] as const) {
      it(`renders fresh 10%, fractional and unknown values in ${route} / ${locale}`, () => {
        const snapshot = ref<{ injectRate: number } | null>({ injectRate: 0.05 });
        const caption = build(computed, true, snapshot, fmt, ref(dictionary), () => locale);
        expect(caption.value).toContain("5%");
        snapshot.value = { injectRate: 0.1 };
        expect(caption.value).toContain("10%");
        expect(caption.value).not.toContain("5%");
        snapshot.value = { injectRate: 0.00123456 };
        expect(caption.value).toContain(`${(0.123456).toLocaleString(locale, { maximumFractionDigits: 8 })}%`);
        expect(caption.value).not.toContain("{rate}");
        snapshot.value = { injectRate: 0 };
        expect(caption.value).toContain("0%");
        snapshot.value = null;
        expect(caption.value).toBe("");
        expect(build(computed, false, snapshot, fmt, ref(dictionary), () => locale).value).toContain("5%");
      });
    }
  }
});
