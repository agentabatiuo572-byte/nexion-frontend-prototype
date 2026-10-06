import { describe, expect, it, vi as mock } from "vitest";
import { directPage, dictionaries, eventFixture, flush, policyFixture, snapshotFixture, text } from "./direct-referral.test-support";

describe("public team copy keeps internal layers private", () => {
  for (const locale of ["en", "zh", "vi"] as const) {
    it(`renders direct reward sources without exposing legacy layers in ${locale}`, async () => {
      const copy = dictionaries[locale];
      expect(copy.teamV3.visualizations.orbitLiveMap).not.toMatch(/\d|圈|orbit|quỹ đạo/i);
      expect(copy.teamV3.visualizations.genealogySubtitle).not.toMatch(/双轨|Track A\/B|Nhánh A\/B/i);
      expect(copy.unilevel.pausedLayersTitle).not.toMatch(/层|layer|tầng/i);
      expect(copy.unilevel.pausedLayersDesc).not.toContain("{layers}");
      expect(copy.pool.weeklyDesc).not.toContain("{rate}");
      expect(copy.poolHowItWorks.currentRules).toContain("{rank}");
      expect(copy.poolHowItWorks.currentRules).not.toContain("{rate}");
      expect(copy.poolHowItWorks.heroSub).not.toMatch(/票|vote|phiếu|快照|snapshot|ảnh chụp/i);
      const events = [eventFixture("purchase"), eventFixture("earning", "direct_device_earning")];
      const page = await directPage({ locale, api: {
        policy: mock.fn().mockResolvedValue(policyFixture()), snapshot: mock.fn().mockResolvedValue(snapshotFixture(events)),
      } });
      await flush();
      const output = text(page.root);
      expect(output).toContain(copy.directReferral.purchase);
      expect(output).toContain(copy.directReferral.networkPurchase);
      expect(output).toContain(copy.directReferral.deviceEarning);
      expect(output).toContain("USDT"); expect(output).toContain("NEX");
      expect(output).not.toMatch(/\bL[1-7]\b|L2–L7|L2-L7/);
    });
  }
});
