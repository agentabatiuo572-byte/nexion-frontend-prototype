// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from "node:fs";
import { computed, ref } from "vue";
import { describe, expect, it } from "vitest";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
const source = readFileSync(new URL("./unilevel.vue", import.meta.url), "utf8");
const start=source.indexOf("const canonicalPolicyText = computed(");
const end=source.indexOf("const pausedLayers = computed(",start);
if(start<0 || end<=start) throw new Error("Policy bindings not found");
const build=new Function("computed","fmt","t","commission","remoteSnapshot",`${source.slice(start,end)};return {canonicalPolicyText,canonicalPeriodText};`);
describe("Unilevel localized canonical policy",()=>{
  for(const [dict, policy, month, all] of [
    [en,"7-day cooling period · promotional multiplier ×1.25","This month","All time"],
    [zh,"冷静期 7 天 · 活动倍率 ×1.25","本月","全部时间"],
    [vi,"Thời gian chờ 7 ngày · hệ số khuyến mãi ×1.25","Tháng này","Toàn bộ thời gian"],
  ] as const) {
    it(`preserves configured values and localizes ${month}`,()=>{
      const config=ref({config:{coolingDays:7,promoMultiplier:1.25}});
      const snapshot=ref({period:"month"});
      const view=build(computed,fmt,ref(dict),config.value,snapshot);
      expect(view.canonicalPolicyText.value).toBe(policy);expect(view.canonicalPeriodText.value).toBe(month);
      config.value.config.coolingDays=15;config.value.config.promoMultiplier=2.5;snapshot.value.period="all";
      expect(view.canonicalPolicyText.value).toContain("15");expect(view.canonicalPolicyText.value).toContain("×2.5");expect(view.canonicalPeriodText.value).toBe(all);
    });
  }
  it("does not invent policy or period before their snapshots exist",()=>{
    const view=build(computed,fmt,ref(zh),{config:null},ref(null));
    expect(view.canonicalPolicyText.value).toBe("");expect(view.canonicalPeriodText.value).toBe("");
  });
  it("does not render a fabricated 30-day policy when cooling is unpublished",()=>{
    const view=build(computed,fmt,ref(zh),{config:{coolingDays:null,promoMultiplier:1}},ref({period:"month"}));
    expect(view.canonicalPolicyText.value).toBe("冷静期配置不可用");
    expect(view.canonicalPolicyText.value).not.toContain("30");
  });
});
