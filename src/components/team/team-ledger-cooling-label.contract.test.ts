import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";

const LOCALES = [
  { name: "zh", teamV3: zh.teamV3 },
  { name: "en", teamV3: en.teamV3 },
  { name: "vi", teamV3: vi.teamV3 },
] as const;

const ledgerCard = readFileSync(new URL("./team-ledger-card.vue", import.meta.url), "utf8");

describe("cooling label never asserts a period the page does not know", () => {
  it("keeps every locale's cooling label free of a hard-coded day count", () => {
    for (const { name, teamV3 } of LOCALES) {
      const label = teamV3.coolingDown;
      expect(label, name).toBeTruthy();
      expect(label, `${name} 仍写死了天数:${label}`).not.toMatch(/\d/);
    }
  });

  it("renders that label on the ledger card, so the assertion above is load-bearing", () => {
    expect(ledgerCard).toContain("t.teamV3.coolingDown");
  });
});
