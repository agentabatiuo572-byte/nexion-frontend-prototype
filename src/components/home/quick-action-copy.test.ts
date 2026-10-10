import { describe, expect, it } from "vitest";
// @ts-expect-error Node-only component contract; application tsconfig omits Node globals.
import { readFileSync } from "node:fs";
import { compileScript, parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import ts from "typescript";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import * as facts from "./quick-action-facts";
import { highestLiveStakingApyPct } from "./home-staking-rate";

const source = readFileSync(new URL("./quick-action-row.vue", import.meta.url), "utf8");
const script = compileScript(parse(source).descriptor, { id: "quick-action-copy" });
const code = ts.transpileModule(script.content, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

function actualChips(dictionary: typeof zh | typeof en | typeof vi) {
  const faucet = Vue.reactive({ remoteReadState: "error", signInStreak: 9 });
  const genesis = Vue.reactive({ remoteSupplyKnown: false, remotePublicReadState: "error", totalSlots: 100, soldSlots: 10 });
  const quest = Vue.reactive({ remoteStatus: "error", remoteQuests: [] });
  const modules: Record<string, unknown> = {
    vue: { ...Vue, onMounted() {} },
    "@dcloudio/uni-app": { onShow() {} },
    "@/lib/route": { navTo() {} },
    "@/composables/use-now": { useNow: () => Vue.ref(Date.now() / 1000) },
    "@/i18n/use-t": { useT: () => Vue.ref(dictionary) },
    "@/i18n/format": { fmt },
    "@/store/nex-faucet": { useNexFaucet: () => faucet },
    "@/store/genesis": { useGenesis: () => genesis },
    "@/store/quest": { useQuest: () => quest },
    "@/composables/use-genesis-sale-gate": { useGenesisSaleGate: () => ({ showUrgency: Vue.ref(true), blockText: Vue.ref(null) }) },
    "@/api/runtime": { remoteApiEnabled: true, stakingApi: {} },
    "./home-staking-rate": { highestLiveStakingApyPct },
    "./quick-action-facts": facts,
  };
  const output: { default?: { setup: (props: object, context: object) => Record<string, Vue.Ref> } } = {};
  new Function("require", "exports", code)((name: string) => {
    if (!(name in modules)) throw new Error(`Unexpected component dependency: ${name}`);
    return modules[name];
  }, output);
  const component = output.default!.setup({}, { expose() {} });
  return { component, faucet, genesis, quest };
}

describe.each(Object.entries({ zh, en, vi }))("compact quick-action copy in %s", (_locale, dictionary) => {
  it("uses a dash for pending and failed facts instead of stale values or long errors", () => {
    const { component } = actualChips(dictionary);
    expect(component.chips.value.map((chip: { sub: string }) => chip.sub)).toEqual(["-", "-", "-", "-"]);
    component.stakingLoading.value = false;
    component.stakingFailed.value = true;
    expect(component.stakingSubtitle.value).toBe("-");
  });
  it("retains confirmed zero, available rates, labels and navigation", () => {
    const { component, faucet, genesis, quest } = actualChips(dictionary);
    faucet.remoteReadState = quest.remoteStatus = genesis.remotePublicReadState = "ready";
    faucet.signInStreak = 0;
    genesis.remoteSupplyKnown = true;
    genesis.soldSlots = genesis.totalSlots;
    component.stakingLoading.value = false;
    component.stakingApyPct.value = 12;
    expect(component.chips.value.map((chip: { sub: string }) => chip.sub)).toEqual([
      fmt(dictionary.home.quickStakeApyFormat, { n: "12" }), fmt(dictionary.home.quickGenesisLeft, { n: 0 }),
      fmt(dictionary.home.quickMissionsCount, { n: 0 }), fmt(dictionary.home.quickDailyStreak, { n: 0 }),
    ]);
    expect(component.chips.value.every((chip: { label: string; href: string }) => chip.label && chip.href.startsWith("/pages/"))).toBe(true);
    component.stakingApyPct.value = null;
    expect(component.stakingSubtitle.value).toBe(dictionary.home.quickStakeStopped);
  });
});
