import { describe, expect, it } from "vitest";

const sources = import.meta.glob([
  "../components/home/featured-learning-card.vue", "../pages/learn/courses.vue",
  "../pages/genesis/holder.vue", "../pages/genesis/marketplace.vue",
  "../pages/store/orders.vue", "../pages/support/chat.vue", "../i18n/messages/*.ts",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const read = (file: string) => sources[`../${file}`];

describe("publication UI regression contracts", () => {
  it("shares reactive dictionary copy for recommendations and human handoff", () => {
    expect(read("components/home/featured-learning-card.vue")).toContain("t.learning.featuredLabel");
    expect(read("pages/learn/courses.vue")).toContain("t.learning.featuredLabel");
    expect(read("pages/support/chat.vue")).toContain("computed(() => t.value.nova.handoff)");
    for (const language of ["en", "zh", "vi"]) {
      const dictionary = read(`i18n/messages/${language}.ts`);
      expect(dictionary).toMatch(/featuredLabel:\s*"[^"]+"/);
      expect(dictionary).toMatch(/handoff:\s*\{[\s\S]*?action:[\s\S]*?recommend:[\s\S]*?fresh:[\s\S]*?confirm:/);
    }
  });

  it.each([
    ["pages/genesis/holder.vue", "genesis.emissionPage.busy"],
    ["pages/genesis/marketplace.vue", "genesis.activityPage.busy"],
    ["pages/store/orders.vue", "genesis.orderPage.busy"],
    ["pages/support/chat.vue", "handoffBusy"],
  ])("keeps %s actions accessible and guarded when busy", (file, busy) => {
    const source = read(file);
    expect(source).not.toMatch(/<\/?button\b/);
    const control = [...source.matchAll(/<view\b[^>]*>/g)].find(([tag]) => tag.includes(`:aria-disabled="${busy}`));
    expect(control, "custom action retains role, focus and busy semantics").toBeDefined();
    expect(control![0]).toContain('role="button"');
    expect(control![0]).toContain('tabindex="0"');
    expect(control![0]).toContain(`:aria-busy="${busy}`);
    // The shared keyboard activation layer handles Enter/Space for role=button.
    expect(control![0]).toContain(`@click="!${busy} &&`);
  });

  it("uses the existing font ladder for the featured course", () => {
    const source = read("components/home/featured-learning-card.vue");
    const sizes = [...source.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(sizes).not.toContain(16);
    expect(source).toContain("font-size:15px");
  });
});
