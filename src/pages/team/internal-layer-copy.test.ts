import { describe, expect, it } from "vitest";
// @ts-expect-error This test runs in Node, outside App declarations.
import { readFileSync } from "node:fs";
import { parse } from "@vue/compiler-sfc";
import { compile } from "@vue/compiler-dom";
import * as Vue from "vue";
import { renderToString } from "@vue/server-renderer";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";

const source = readFileSync(new URL("./unilevel.vue", import.meta.url), "utf8");
const template = parse(source).descriptor.template!.content;
const eventLine = template.split(/\r?\n/).find((line: string) => line.includes("{{ event.cycle }}"));
if (!eventLine) throw new Error("Reward event caption is missing");
const { code } = compile(eventLine, { mode: "function", prefixIdentifiers: true });
const render = new Function("Vue", code)(Vue);

describe("public team copy keeps internal layers private", () => {
  for (const [locale, copy] of Object.entries({ en, zh, vi })) {
    it(`renders every reward layer as a public category in ${locale}`, async () => {
      expect(copy.teamV3.visualizations.orbitLiveMap).not.toMatch(/\d|圈|orbit|quỹ đạo/i);
      expect(copy.teamV3.visualizations.genealogySubtitle).not.toMatch(/双轨|Track A\/B|Nhánh A\/B/i);
      expect(copy.unilevel.pausedLayersTitle).not.toMatch(/层|layer|tầng/i);
      expect(copy.unilevel.pausedLayersDesc).not.toContain("{layers}");
      expect(copy.pool.weeklyDesc).not.toContain("{rate}");
      expect(copy.poolHowItWorks.currentRules).toContain("{rank}");
      expect(copy.poolHowItWorks.currentRules).not.toContain("{rate}");
      expect(copy.poolHowItWorks.heroSub).not.toMatch(/票|vote|phiếu|快照|snapshot|ảnh chụp/i);
      for (let layer = 1; layer <= 7; layer++) {
        const component = Vue.defineComponent({
          render,
          setup: () => ({
            t: copy, event: { layer, cycle: "2026-10", currency: "USDT" },
          }),
        });
        const html = await renderToString(Vue.createSSRApp(component));
        expect(html).toContain(layer === 1 ? copy.unilevel.memberBadgeDirect : copy.unilevel.memberBadgeExtended);
        expect(html).toContain("2026-10");
        expect(html).toContain("USDT");
        expect(html).not.toMatch(/\bL[1-7]\b/);
      }
    });
  }
});
