import { describe, expect, it } from "vitest";
import { platformDisplayText } from "./brand-copy";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import { resolvePublishedNexNarrative } from "./nex-published-content";
import { EVENTS } from "@/mock/events";

describe("UVEL / UVT display boundaries", () => {
  it.each([
    "NexGrid 隐私说明（仅供测试）", "Nexion Terms: NEX rewards are not guaranteed.",
    "NEX余额 · $NEX · NEX/USDT · +5 NEX", "UVEL Terms: UVT rewards are not guaranteed.",
    "StellarBox S1 / StellarRack P1", "https://nexgrid.io/privacy，NEX 奖励",
    "USDT_TO_UVT NEX-GEN-0001 NEXION_USDT_WALLET",
  ])("preserves published source copy and link targets: %s", input => {
    expect(platformDisplayText(input)).toBe(input);
  });

  it("keeps published metadata and source text without hiding unmigrated words", () => {
    const original = { sectionKey: "nexNarrative" as const, version: "v7", description: "", structure: "", fields: [
      { key: "hero.en", label: "", value: "NEX on NexGrid" },
      { key: "subhero.en", label: "", value: "NEX may lose value." },
    ] };
    expect(resolvePublishedNexNarrative([original], "ready", "en")).toEqual({
      state: "ready", version: "v7", hero: "NEX on NexGrid", subhero: "NEX may lose value.",
    });
    expect(original.fields[0].value).toBe("NEX on NexGrid");
  });

  it.each([en, zh, vi])("has no retired token labels in bundled copy", (messages) => {
    expect(JSON.stringify(messages)).not.toMatch(/\bNEX\b/);
    expect(messages.nexWallet.pageTitle).toContain("UVT");
  });

  it("ships corrected static event copy while retaining event identities and reward fields", () => {
    for (const event of EVENTS) {
      expect(JSON.stringify([event.title, event.subtitle, event.reward, event.progress?.label])).not.toMatch(/\bNEX\b/);
    }
    expect(EVENTS.find(event => event.id === "evt-weekend-double-nex")?.title).toBe("Weekend Double UVT");
    expect(EVENTS.find(event => event.id === "evt-onboarding-7d")?.rewardNEX).toBe(200);
  });
});
