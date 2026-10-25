import { describe, expect, it } from "vitest";
import { computed, ref } from "vue";
import ts from "typescript";
import page from "./detail.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi } from "@/i18n/messages/vi";
import { productCopy, specRow, specText } from "@/lib/product-copy";
import type { Product } from "@/mock/products";

const declarations = page.slice(page.indexOf("const hardwareSpecs ="), page.indexOf("const aiExpanded ="));
const code = ts.transpileModule(`${declarations}; return { hardwareSpecs, aiPerfRows };`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function specifications(messages: typeof en) {
  const product = ref<Product>({ id: "stellarbox-s1", name: "S1", tier: "Entry", tagline: "",
    gpu: "RTX 4090", vram: "96GB", power: "65W", datacenter: "DC-1",
    dailyEarn: 1, dailyEarnNEX: 1, price: 1299, sold: 0, features: [],
    ai: { imageGenPerMin: 2, llmTokensPerSec: 50 },
  });
  const result = new Function("computed", "product", "t", "specText", "specRow", "isShare", "copy", code)(
    computed, product, ref(messages), specText, specRow, ref(false),
    computed(() => productCopy(messages, product.value, true)),
  );
  return { product, ...result };
}

describe("current catalog drives the complete detail specifications", () => {
  it.each([zh, en, vi])("shows hardware and AI rows in each language without mock values", messages => {
    const view = specifications(messages);
    expect(view.hardwareSpecs.value).toEqual([
      { k: messages.store.specGpu, v: "RTX 4090" },
      { k: messages.store.specVram, v: "96GB" },
      { k: messages.store.specPower, v: "65W" },
      { k: messages.store.specOnlineRate, v: "-" },
    ]);
    expect(view.aiPerfRows.value.map((row: { v: string }) => row.v)).toEqual([
      `2 ${messages.store.aiUnitImgMin}`, `0.05 ${messages.store.aiUnitTokSec}`,
      "-", "-", "-",
    ]);
    view.product.value = { ...view.product.value, uptime: "99.5%", ai: { imageGenPerMin: 0, llmTokensPerSec: 1, unlocks: "LL" } };
    expect(view.hardwareSpecs.value[3].v).toBe("99.5%");
    expect(view.aiPerfRows.value[0].v).toBe(`0 ${messages.store.aiUnitImgMin}`);
    expect(view.aiPerfRows.value[1].v).toBe(`0.001 ${messages.store.aiUnitTokSec}`);
    expect(view.aiPerfRows.value[4].v).toBe(messages.market.workloads.LL.label);
    view.product.value = { ...view.product.value, ai: undefined };
    expect(view.aiPerfRows.value.every((row: { v: string }) => row.v === "-")).toBe(true);
  });

  it("keeps empty material separate from load failure and offers retry only for failed reads", () => {
    const material = page.slice(page.indexOf("<!-- === Section 7:"), page.indexOf("<!-- === Section 8:"));
    expect(material).toContain("relatedMaterialsEmpty");
    expect(material).toContain("trustStatus === 'error' ? t.store.relatedMaterialsLoadFailed : t.store.relatedMaterialsEmpty");
    expect(material).toContain('v-if="trustStatus === \'error\'" class="product-material-retry"');
    expect(material).toContain('@click="refreshTrustMaterial"');
    expect(page).toContain("if (trustStatus.value === 'error') void refreshTrust(true)");
    expect(material).not.toContain("t.trust.errorUnavailable");
    expect(material).toContain("@click=\"openTrustUrl(row.Url)\"");
    expect(page).not.toContain("remoteApiEnabled ? null : product.value?.ai");
  });
});
