import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed } from "vue";
import ts from "typescript";
import type { TrialAuthorityState } from "@/api/trial-api";
import hero from "@/components/trial-hero-banner.vue?raw";
import banner from "@/components/trial-promo-banner.vue?raw";
import ghost from "@/components/trial-ghost-slot.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";

const remote = vi.hoisted(() => ({ state: vi.fn(), eligibility: vi.fn(), start: vi.fn() }));
vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true, fundsServerEnabled: true, developmentFundsEnabled: false,
  trialApi: remote, orderApi: {}, accountApi: {}, walletApi: {}, voucherApi: {},
  productPhaseApi: { current: vi.fn() }, productCatalogApi: { catalog: vi.fn() },
}));
vi.mock("@/mock/products", () => ({ clearProductCatalog: vi.fn(), replaceProductCatalog: vi.fn() }));

// The store must be imported after the api mock is registered (vi.mock hoists).
const { useFreeTrial } = await import("@/store/free-trial");
const { computeTrialOffset, computeDiscountedPrice, useTrialConfig } = await import("@/store/trial-config");

interface PolicyConfig {
  trialDays: number;
  shadowDailyUSD: number;
  trialOffsetCapUSD: number;
}

function policyConfig(): PolicyConfig {
  return { trialDays: 3, shadowDailyUSD: 38.52, trialOffsetCapUSD: 50 };
}

/**
 * Evaluate named script-setup declarations from a .vue source against the real
 * dependencies they close over — the page under test, not a re-implementation.
 */
function actual(source: string, names: string[], deps: Record<string, unknown>) {
  const script = source.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1];
  const ast = ts.createSourceFile("actual.ts", script, ts.ScriptTarget.Latest, true);
  const statements = ast.statements.filter(item => ts.isFunctionDeclaration(item)
    ? names.includes(item.name?.text ?? "")
    : ts.isVariableStatement(item) && item.declarationList.declarations.some(d => names.includes(d.name.getText(ast))));
  const body = ts.transpileModule(
    statements.map(s => s.getText(ast)).join("\n") + `\nreturn {${names.join(",")}}`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  return new Function(...Object.keys(deps), body)(...Object.values(deps));
}

function authority(canStart = true): TrialAuthorityState {
  return { authoritative: true, serverCanonical: true, serverState: "ELIGIBLE", status: "none", canStart,
    eligibilityReason: canStart ? undefined : "used", serverNow: 1_725_000_000_000, version: 1, claimNo: null,
    startedAt: null, expiresAt: null, graceEndsAt: null, finishedAt: null, cooldownUntil: null,
    shadowUSD: 0, shadowNEX: 0, source: "nx_trial_claim", sourceEnvironment: "PRODUCTION", runId: "",
    provenance: { source: "nx_trial_claim", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" },
    paymentRail: "NEXION_USDT_WALLET",
    config: { trialDays: "3", graceDays: "7", discountRate: "0.15", discountCapUSD: "20",
      trialOffsetCapUSD: "50", trialProductId: "stellarbox-s1", trialProductName: "NexGridBox S1",
      trialPriceUSD: "1299", shadowDailyUSD: "38.52", shadowDailyNEX: "65", seatsLeftToday: "1",
      phaseOpen: true, autoPushEnabled: true, autoPushDelayMs: "1500", autoPushCooldownHours: "24", autoPushMaxPerSession: "1" } };
}

/** Hero credit computeds, closed over the authoritative policy config. */
function heroCredit(config: PolicyConfig) {
  return actual(hero, ["est", "dailyEarnText"], {
    computed,
    trialDays: computed(() => config.trialDays),
    dailyEarn: computed(() => config.shadowDailyUSD),
    trialOffset: computed(() => computeTrialOffset(config as never, config.trialDays * config.shadowDailyUSD)),
  });
}

beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks(); });

it.each([en, zh, vietnamese])("active trial savings retain the monetary unit of the authoritative discount", (copy) => {
  const trialCfg = useTrialConfig();
  trialCfg.applyAuthoritative({ ...authority().config, discountCapUSD: "50" });
  const { discountText } = actual(ghost, ["discount", "discountText"], {
    computed, trialCfg, computeDiscountedPrice, t: computed(() => copy), fmt,
  });
  expect(discountText.value).toBe(fmt(copy.trial.ghostDiscount, { amount: "$50" }));
  expect(discountText.value).toContain("$50");
});

describe("earn hero quotes the creditable trial offset, not the raw accrual", () => {
  it("caps the quoted 3-day credit at the offset cap", () => {
    const config = policyConfig();
    // Raw accrual is 3 × 38.52 = $115.56; only the capped $50 can ever offset.
    expect(config.trialDays * config.shadowDailyUSD).toBeCloseTo(115.56, 2);
    const { est } = heroCredit(config);
    expect(est.value).toBe(50);
  });

  it("never quotes more than the trial offset cap, whatever the shadow rate is", () => {
    for (const shadowDailyUSD of [0.5, 1, 7, 38.52, 100]) {
      const config = { trialDays: 3, shadowDailyUSD, trialOffsetCapUSD: 50 };
      const { est } = heroCredit(config);
      expect(est.value).toBeLessThanOrEqual(50);
      expect(est.value).toBe(Math.round(Math.min(config.trialDays * shadowDailyUSD, 50)));
    }
  });

  it("states the cap as the credit basis when the cap bites, and the rate line otherwise", () => {
    const fmt = (template: string, values: Record<string, string>) =>
      template.replace(/\{(\w+)\}/g, (_, key: string) => values[key]);
    const capped = policyConfig();
    const cappedBasis = actual(hero, ["creditBasisText"], {
      computed,
      trialOffset: computed(() => computeTrialOffset(capped as never, capped.trialDays * capped.shadowDailyUSD)),
      trialDays: computed(() => capped.trialDays),
      dailyEarn: computed(() => capped.shadowDailyUSD),
      dailyEarnText: computed(() => `$${capped.shadowDailyUSD.toFixed(2)}/d × ${capped.trialDays}`),
      trialCfg: { config: { trialOffsetCapUSD: capped.trialOffsetCapUSD } },
      t: computed(() => ({ trial: { heroCreditCapNote: "最高抵 ${cap}" } })),
      fmt,
    }).creditBasisText;
    expect(cappedBasis.value).toBe("最高抵 $50");

    // Below the cap the total IS days × rate, so the rate line stays the basis.
    const under = { trialDays: 3, shadowDailyUSD: 1, trialOffsetCapUSD: 50 };
    const underBasis = actual(hero, ["creditBasisText"], {
      computed,
      trialOffset: computed(() => computeTrialOffset(under as never, under.trialDays * under.shadowDailyUSD)),
      trialDays: computed(() => under.trialDays),
      dailyEarn: computed(() => under.shadowDailyUSD),
      dailyEarnText: computed(() => `$${under.shadowDailyUSD.toFixed(2)}/d × ${under.trialDays}`),
      trialCfg: { config: { trialOffsetCapUSD: under.trialOffsetCapUSD } },
      t: computed(() => ({ trial: { heroCreditCapNote: "最高抵 ${cap}" } })),
      fmt,
    }).creditBasisText;
    expect(underBasis.value).toBe("$1.00/d × 3");
  });
});

describe("trial offer labels hold through a background read", () => {
  it("keeps the confirmed hero and promo CTA copy while a poll is in flight", async () => {
    const trial = useFreeTrial();
    remote.state.mockResolvedValueOnce(authority());
    await trial.refreshRemote();
    const { claimCtaText } = actual(hero, ["claimCtaText"], { computed, trial, t: computed(() => ({ trial: { heroClaimCta: "立即领取", entryUnavailable: "暂不可领取", entryChecking: "正在核实资格…" }, store: { temporarilyOutOfStock: "缺货" } })) });
    const { claimLabel } = actual(banner, ["claimLabel"], { computed, trial, t: computed(() => ({ trial: { entryClaimCta: "马上领取", entryUnavailable: "暂不可领取", entryChecking: "正在核实资格…" } })) });
    expect(claimCtaText.value).toBe("立即领取");
    expect(claimLabel.value).toBe("马上领取");

    let resolvePoll!: (value: TrialAuthorityState) => void;
    const promise = new Promise<TrialAuthorityState>((done) => { resolvePoll = done; });
    remote.state.mockReturnValueOnce(promise);
    const poll = trial.poll(Date.now());
    expect(claimCtaText.value).toBe("立即领取");
    expect(claimLabel.value).toBe("马上领取");
    expect(trial.canStart()).toBe(false);
    resolvePoll(authority());
    await poll;
    expect(claimCtaText.value).toBe("立即领取");
    expect(remote.start).not.toHaveBeenCalled();
  });

  it("uses the checking placeholder only before any offer is confirmed", () => {
    const trial = useFreeTrial();
    const { claimLabel } = actual(banner, ["claimLabel"], { computed, trial, t: computed(() => ({ trial: { entryClaimCta: "马上领取", entryUnavailable: "暂不可领取", entryChecking: "正在核实资格…" } })) });
    expect(claimLabel.value).toBe("正在核实资格…");
  });
});

describe("trial config authority feeds the shared capped-offset helper", () => {
  it("applies the server policy and quotes the capped offset from it", () => {
    const cfg = useTrialConfig();
    cfg.applyAuthoritative(authority().config);
    expect(cfg.config.trialOffsetCapUSD).toBe(50);
    expect(computeTrialOffset(cfg.config, cfg.config.trialDays * cfg.config.shadowDailyUSD).offsetUSD).toBe(50);
  });
});
