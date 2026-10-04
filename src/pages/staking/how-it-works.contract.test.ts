// @ts-expect-error Node is intentionally excluded from the App tsconfig.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(new URL("./how-it-works.vue", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const locales = [
  readFileSync(new URL("../../i18n/messages/zh.ts", import.meta.url), "utf8"),
  readFileSync(new URL("../../i18n/messages/en.ts", import.meta.url), "utf8"),
  readFileSync(new URL("../../i18n/messages/vi.ts", import.meta.url), "utf8"),
].map((source) => source.replace(/\r\n/g, "\n"));

const automaticPayoutCopy = /到期自动到账|到期自动领取|自动 claim|auto-claim|auto-credited at maturity|credited to your wallet on unlock|tự động nhận sau khi đáo hạn/i;

function stakingMaturityCopy(source: string) {
  const howStart = source.indexOf("  stakingHowItWorks: {");
  const howEnd = source.indexOf("\n  },\n\n  ", howStart);
  const how = source.slice(howStart, howEnd);
  const keyed = ["stakingMatures", "apyVariableNotice", "autoClaimToast", "tier1_nex_v2_lock_body"].map((key) => {
    const match = source.match(new RegExp(`\\b${key}:\\s*(?:\"([^\"]*)\"|\\n\\s*\"([^\"]*)\")`));
    return match?.[1] ?? match?.[2] ?? "";
  });
  return [how, ...keyed].join("\n");
}

describe("staking rules explanation", () => {
  it("uses the declared $100 example and shows each pool's own minimum", () => {
    expect(page).toContain("const STAKING_RULE_EXAMPLE_PRINCIPAL = 100;");
    expect(page).toContain("STAKING_RULE_EXAMPLE_PRINCIPAL * apy * (termDays / 365)");
    expect(page).not.toContain("1000 * apy");
    expect(page).toContain("w.colMin");
    expect(page).toContain("minText:");
  });

  it("does not promise automatic maturity payouts in staking copy", () => {
    for (const source of locales) {
      expect(stakingMaturityCopy(source)).not.toMatch(automaticPayoutCopy);
    }
  });

  it("shows opening steps only for a sellable server plan and explains paused or unknown states", () => {
    expect(page).toContain('stakingAvailable.value = ready ? staking.pools.some((pool) => pool.enabled && !pool.killed && pool.status === "ACTIVE") : null;');
    expect(page).toContain('v-if="stakingAvailable === true" style="display: flex; flex-direction: column; gap: 14px"');
    expect(page).toContain('stakingAvailable === false ? w.newStakesPaused : w.newStakesUnknown');
    expect(page).toContain('stakingAvailable === false ? w.faqA4Paused : w.faqA4Unknown');
    for (const source of locales) {
      const copy = stakingMaturityCopy(source);
      expect(copy).toMatch(/newStakesPaused:/);
      expect(copy).toMatch(/newStakesUnknown:/);
      expect(copy).toMatch(/faqA4Paused:/);
      expect(copy).toMatch(/faqA4Unknown:/);
      expect(copy).toMatch(/position|持仓|vị thế/i);
    }
  });
});
