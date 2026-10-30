import { compile } from "@vue/compiler-dom";
import { compileScript, parse } from "@vue/compiler-sfc";
import { renderToString } from "@vue/server-renderer";
import * as Vue from "vue";
import ts from "typescript";
import { expect, it, vi } from "vitest";
import ladderSource from "./cluster-ladder.vue?raw";
import tickerSource from "./purchase-ticker.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { nexGridBrandText } from "@/lib/brand-copy";
import { createRemoteAccountEpoch } from "@/lib/remote-account-epoch";
import * as yieldAuthority from "@/lib/store-yield-authority";

function compiled(source: string) {
  const { descriptor } = parse(source);
  const code = ts.transpileModule(compileScript(descriptor, { id: "store-brand" }).content, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const render = new Function("Vue", compile(descriptor.template!.content, {
    mode: "function", prefixIdentifiers: true, isCustomElement: tag => ["view", "text"].includes(tag),
  }).code)(Vue);
  return { code, render };
}
const ladder = compiled(ladderSource);
const ticker = compiled(tickerSource);

// Execute the actual component setup and template; replace only host lifecycle/API boundaries.
async function view(component: ReturnType<typeof compiled>, copy: typeof en, props: object,
  activity: ReturnType<typeof vi.fn> = vi.fn(), remote = true) {
  const mounts: Array<() => void> = [], unmounts: Array<() => void> = [];
  const imports: Record<string, unknown> = {
    vue: { ...Vue, onMounted: (fn: () => void) => mounts.push(fn), onUnmounted: (fn: () => void) => unmounts.push(fn) },
    "@/i18n/use-t": { useT: () => Vue.ref(copy) }, "@/lib/brand-copy": { nexGridBrandText },
    "./section-header.vue": { default: { render: () => null } },
    "@/lib/store-yield-authority": yieldAuthority,
    "@/composables/use-scroll-grow-progress": { useScrollGrowProgress: () => ({ elRef: Vue.ref(null), inView: Vue.ref(true) }), PROGRESS_GROW_TRANSITION: "none" },
    "@/lib/remote-account-epoch": { createRemoteAccountEpoch },
    "@/api/runtime": { remoteApiEnabled: remote, storefrontActivityApi: { activity } },
    "@/store/app": { useApp: () => Vue.reactive({ accountKey: "store-user" }) },
  };
  const exports = { default: {} as { setup: (...args: unknown[]) => Record<string, unknown> } };
  new Function("require", "exports", component.code)((id: string) => {
    if (!(id in imports)) throw new Error(`Unexpected store import: ${id}`);
    return imports[id];
  }, exports);
  const scope = Vue.effectScope();
  const state = scope.run(() => exports.default.setup(props, { expose() {} }))!;
  const html = () => renderToString(Vue.createSSRApp({
    components: { SectionHeader: { render: () => null } },
    render: component.render, setup: () => Vue.proxyRefs({ ...state }),
  }));
  return {
    html,
    async mount() { mounts.forEach(fn => fn()); await Promise.resolve(); await Promise.resolve(); },
    close() { unmounts.forEach(fn => fn()); scope.stop(); },
  };
}

for (const [locale, copy] of [["en", en], ["zh", zh], ["vi", vietnamese]] as const) {
  for (const theme of ["light", "dark"]) {
    it(`${locale}/${theme}: brands the current-owned ladder label without rewriting the device`, async () => {
      const owned = { kind: "stellarbox-pro-v2", name: "NexGridBox Pro v2", activatedAt: 1, baseRate: 4, baseRateNEX: 2 };
      const authority = { ladder: [{ id: "phone", amount: null, widthPct: 0 }, { id: "pro", amount: { usd: 2, nex: 1 }, widthPct: 100 }] };
      const before = structuredClone({ owned, authority });
      const instance = await view(ladder, copy, { owned, authority });
      try {
        const html = `<main data-theme="${theme}">${await instance.html()}</main>`;
        expect(html).toContain("UVELBox Pro v2");
        expect(html).not.toContain("NexGridBox");
        expect(html).toContain(copy.store.ladderYou);
        expect(html).toContain('aria-label="$4.00"');
        expect({ owned, authority }).toEqual(before);
      } finally { instance.close(); }
    });

    it(`${locale}/${theme}: brands rotating purchase activity while preserving remote history and request`, async () => {
      vi.useFakeTimers();
      const snapshot = { items: [
        { productName: "NexGridBox S1", occurredAt: "2026-10-18T03:00:00" },
        { productName: "StellarRack P1", occurredAt: "2026-10-18T03:01:00" },
      ] };
      const before = structuredClone(snapshot);
      const activity = vi.fn().mockResolvedValue(snapshot);
      const instance = await view(ticker, copy, {}, activity);
      try {
        expect(await instance.html()).not.toContain(copy.store.tickerBought);
        await instance.mount();
        let html = `<main data-theme="${theme}">${await instance.html()}</main>`;
        expect(html).toContain(copy.store.tickerBought);
        expect(html).toContain("UVELBox S1");
        expect(html).not.toContain("NexGridBox");
        expect(html).toContain("2026-10-18 03:00:00");
        await vi.advanceTimersByTimeAsync(3400);
        html = await instance.html();
        expect(html).toContain("UVELRack P1");
        expect(html).not.toContain("StellarRack");
        expect(activity).toHaveBeenCalledExactlyOnceWith(8);
        expect(snapshot).toEqual(before);
      } finally { instance.close(); vi.useRealTimers(); }
    });
  }
}

it.each(["empty", "failed"])("does not invent purchase activity after %s reads", async state => {
  const activity = state === "empty" ? vi.fn().mockResolvedValue({ items: [] }) : vi.fn().mockRejectedValue(new Error("offline"));
  const instance = await view(ticker, en, {}, activity);
  try { await instance.mount(); expect(await instance.html()).not.toContain(en.store.tickerBought); }
  finally { instance.close(); }
});
