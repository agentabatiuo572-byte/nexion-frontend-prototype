import { computed, reactive } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import ts from "typescript";
import page from "./genesis.vue?raw";
import { fmt } from "@/i18n/format";
import { remainderUiCopy } from "@/i18n/remainder-ui";
import { genesisSupplyDisplay } from "@/lib/genesis-supply-display";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi as vietnamese } from "@/i18n/messages/vi";

const messages = { zh, en, vi: vietnamese };

afterEach(() => vi.useRealTimers());

function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(120_000);
  const genesis = reactive({ soldSlots: 25, totalSlots: 1275, remoteSupplyKnown: true, unitPriceUSDT: 9999,
    remoteListings: [{ tokenId: 7, priceUSDT: 10000, listedAt: 0 }] });
  const locale = reactive<{ code: "zh" | "en" | "vi" }>({ code: "zh" });
  const remainderCopy = computed(() => remainderUiCopy[locale.code]);
  const section = page.slice(page.indexOf("const sold = computed"), page.indexOf("// Dock 文案:"));
  const code = ts.transpileModule(section + "return { supplyCaption, liveMarket, ageText };", {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const value = new Function("computed", "genesis", "locale", "remainderCopy", "fmt", "genesisSupplyDisplay", "remoteApiEnabled", code)(
    computed, genesis, locale, remainderCopy, fmt, genesisSupplyDisplay, true,
  );
  return { genesis, locale, value };
}

describe("Genesis supply and listing age presentation", () => {
  it("uses the confirmed total and reacts to supply changes, never advertising an unread count", () => {
    const f = fixture();
    expect(f.value.supplyCaption.value).toBe("共 1,275 席 · 售完即止");
    f.genesis.totalSlots = 2500;
    expect(f.value.supplyCaption.value).toBe("共 2,500 席 · 售完即止");
    f.genesis.remoteSupplyKnown = false;
    expect(f.value.supplyCaption.value).toBe("");
  });

  it("re-localizes existing listings and real supply in all three supported languages", () => {
    const f = fixture();
    const expected = { zh: "2 分钟前", en: "2 minutes ago", vi: "2 phút trước" };
    for (const code of ["zh", "en", "vi"] as const) {
      f.locale.code = code;
      expect(fmt(messages[code].genesis.agoLabel, { t: f.value.liveMarket.value[0].ago })).toBe(expected[code]);
      expect(f.value.liveMarket.value[0].ago).not.toMatch(/^\d+[mh]$/);
      expect(f.value.supplyCaption.value).toBe(fmt(remainderUiCopy[code].genesisSupply, { n: (1275).toLocaleString(code) }));
      expect(f.value.liveMarket.value[0].price).toBe(10000);
    }
  });

  it("handles minute/hour/day boundaries and English singular without duplicating ago", () => {
    const f = fixture();
    f.locale.code = "en";
    for (const [minutes, expected] of [[0, "0 minutes ago"], [1, "1 minute ago"], [60, "1 hour ago"], [120, "2 hours ago"], [1440, "1 day ago"], [2880, "2 days ago"]] as const) {
      const duration = f.value.ageText(120_000 - minutes * 60_000);
      expect(fmt(en.genesis.agoLabel, { t: duration })).toBe(expected);
    }
  });
});
