import { describe, expect, it } from "vitest";
import { platformDisplayText } from "./brand-copy";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import { resolvePublishedNexNarrative } from "./nex-published-content";

describe("UVEL / UVT display boundaries", () => {
  it.each([
    ["NexGrid 隐私说明（仅供测试）", "UVEL 隐私说明（仅供测试）"],
    ["Nexion Terms: NEX rewards are not guaranteed.", "UVEL Terms: UVT rewards are not guaranteed."],
    ["NEX余额 · $NEX · NEX/USDT · +5 NEX", "UVT余额 · $UVT · UVT/USDT · +5 UVT"],
    ["NEX-token / NEX-only", "UVT-token / UVT-only"],
    ["StellarBox S1 / StellarRack P1 / StellarBox-custom", "UVELBox S1 / UVELRack P1 / StellarBox-custom"],
    ["https://nexgrid.io/privacy，NEX 奖励", "https://nexgrid.io/privacy，UVT 奖励"],
    ["USDT_TO_UVT NEX-GEN-0001 NEXION_USDT_WALLET", "USDT_TO_UVT NEX-GEN-0001 NEXION_USDT_WALLET"],
    ["NexGrid: privacy@nexgrid.com https://nexgrid.com/NEX nexgrid.com/privacy", "UVEL: privacy@nexgrid.com https://nexgrid.com/NEX nexgrid.com/privacy"],
  ])("formats display copy without changing link targets: %s", (input, expected) => {
    expect(platformDisplayText(input)).toBe(expected);
  });

  it("keeps published metadata and source text while rendering the current token", () => {
    const original = { sectionKey: "nexNarrative" as const, version: "v7", description: "", structure: "", fields: [
      { key: "hero.en", label: "", value: "NEX on NexGrid" },
      { key: "subhero.en", label: "", value: "NEX may lose value." },
    ] };
    expect(resolvePublishedNexNarrative([original], "ready", "en")).toEqual({
      state: "ready", version: "v7", hero: "UVT on UVEL", subhero: "UVT may lose value.",
    });
    expect(original.fields[0].value).toBe("NEX on NexGrid");
  });

  it.each([en, zh, vi])("has no retired token labels in bundled copy", (messages) => {
    expect(JSON.stringify(messages)).not.toMatch(/\bNEX\b/);
    expect(messages.nexWallet.pageTitle).toContain("UVT");
  });
});
