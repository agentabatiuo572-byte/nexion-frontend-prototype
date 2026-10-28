import { formatAmount } from "@/lib/amount-display";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { computed, effectScope, ref, type EffectScope } from "vue";
import ts from "typescript";
import type { TrialAuthorityState } from "@/api/trial-api";
import hero from "@/components/trial-hero-banner.vue?raw";
import banner from "@/components/trial-promo-banner.vue?raw";
import ghost from "@/components/trial-ghost-slot.vue?raw";
import trialPage from "@/pages/me/trial.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";
import { fmt } from "@/i18n/format";
import { trialLifecycleCopy } from "@/i18n/trial-lifecycle";

const remote = vi.hoisted(() => ({ state: vi.fn(), eligibility: vi.fn(), start: vi.fn() }));
vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: true, fundsServerEnabled: true, developmentFundsEnabled: false,
  trialApi: remote, orderApi: {}, accountApi: {}, walletApi: {}, voucherApi: {},
  productPhaseApi: { current: vi.fn() }, productCatalogApi: { catalog: vi.fn() },
}));
vi.mock("@/mock/products", () => ({ clearProductCatalog: vi.fn(), replaceProductCatalog: vi.fn() }));
vi.mock("@/store/app", () => ({ useApp: () => ({ accountKey: "user:trial-offer-review", accountBindingEpoch: 1 }) }));
vi.mock("@/composables/use-now", () => ({ useNow: () => ref(1_725_000_000) }));

// The store must be imported after the api mock is registered (vi.mock hoists).
const { useFreeTrial } = await import("@/store/free-trial");
const { computeTrialOffset, computeDiscountedPrice, useTrialConfig } = await import("@/store/trial-config");
const { useTrialPresentation } = await import("@/composables/use-trial-presentation");
const scopes: EffectScope[] = [];

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
  return new Function("formatAmount", ...Object.keys(deps), body)(formatAmount, ...Object.values(deps));
}

function authority(canStart = true): TrialAuthorityState {
  return { authoritative: true, serverCanonical: true, serverState: "ELIGIBLE", status: "none", canStart,
    eligibilityReason: canStart ? undefined : "used", serverNow: 1_725_000_000_000, version: 1, claimNo: null,
    startedAt: null, expiresAt: null, graceEndsAt: null, finishedAt: null, cooldownUntil: null,
    shadowUSD: 0, shadowNEX: 0, source: "nx_trial_claim", sourceEnvironment: "PRODUCTION", runId: "",
    provenance: { source: "nx_trial_claim", serverCanonical: true, sourceEnvironment: "PRODUCTION", runId: "" },
    paymentRail: "UVEL_USDT_WALLET",
    config: { trialDays: "3", graceDays: "7", discountRate: "0.15", discountCapUSD: "20",
      trialOffsetCapUSD: "50", trialProductId: "stellarbox-s1", trialProductName: "NexGridBox S1",
      trialPriceUSD: "1299", shadowDailyUSD: "38.52", shadowDailyNEX: "65", seatsLeftToday: "1",
      phaseOpen: true, autoPushEnabled: true, autoPushDelayMs: "1500", autoPushCooldownHours: "24", autoPushMaxPerSession: "1" } };
}

/** Real authority -> store -> lifecycle presentation -> hero amount and basis. */
async function heroCredit(config: PolicyConfig) {
  const receipt = authority();
  remote.state.mockResolvedValueOnce({ ...receipt, config: { ...receipt.config,
    trialDays: String(config.trialDays), shadowDailyUSD: String(config.shadowDailyUSD),
    trialOffsetCapUSD: String(config.trialOffsetCapUSD),
  } });
  expect(await useFreeTrial().refreshRemote()).toBe(true);
  const scope = effectScope(); scopes.push(scope);
  const trialView = scope.run(() => useTrialPresentation())!;
  return { trialView, ...actual(hero, ["trialDays", "dailyEarn", "estimateText", "dailyEarnText", "creditBasisText"], {
    computed, trialView, trialCfg: useTrialConfig(), t: computed(() => zh), fmt,
  }) };
}

beforeEach(() => { setActivePinia(createPinia()); vi.resetAllMocks(); });
afterEach(() => scopes.splice(0).forEach(scope => scope.stop()));

it.each([en, zh, vietnamese])("active trial savings retain the monetary unit of the authoritative discount", (copy) => {
  const trialCfg = useTrialConfig();
  trialCfg.applyAuthoritative({ ...authority().config, discountCapUSD: "50" });
  const { discountText } = actual(ghost, ["discount", "discountText"], {
    computed, trialCfg, computeDiscountedPrice, t: computed(() => copy), fmt,
  });
  expect(discountText.value).toBe(fmt(copy.trial.ghostDiscount, { amount: "$50.00" }));
  expect(discountText.value).toContain("$50.00");
});

describe("earn hero quotes the creditable trial offset, not the raw accrual", () => {
  it("caps the quoted 3-day credit at the offset cap", async () => {
    const config = policyConfig();
    // Raw accrual is 3 × 38.52 = $115.56; only the capped $50 can ever offset.
    expect(config.trialDays * config.shadowDailyUSD).toBeCloseTo(115.56, 2);
    const { trialView, estimateText } = await heroCredit(config);
    expect(trialView.estimatedUSD.value).toBeCloseTo(115.56, 2);
    expect(trialView.estimatedOffsetUSD.value).toBe(50);
    expect(estimateText.value).toBe("$50.00");
  });

  it("never quotes more than the trial offset cap, whatever the shadow rate is", async () => {
    for (const shadowDailyUSD of [0.5, 1, 7, 38.52, 100]) {
      const config = { trialDays: 3, shadowDailyUSD, trialOffsetCapUSD: 50 };
      const { trialView, estimateText } = await heroCredit(config);
      const expected = Math.min(config.trialDays * shadowDailyUSD, 50);
      expect(trialView.estimatedOffsetUSD.value).toBeLessThanOrEqual(50);
      expect(trialView.estimatedOffsetUSD.value).toBe(expected);
      expect(estimateText.value).toBe(`$${expected.toFixed(2)}`);
    }
  });

  it("preserves fractional credit instead of rounding above the configured cap", async () => {
    const { trialView, estimateText } = await heroCredit({ trialDays: 3, shadowDailyUSD: 40, trialOffsetCapUSD: 49.99 });
    expect(trialView.estimatedUSD.value).toBe(120);
    expect(trialView.estimatedOffsetUSD.value).toBe(49.99);
    expect(estimateText.value).toBe("$49.99");
  });

  it("states the cap as the credit basis when the cap bites, and the rate line otherwise", async () => {
    const capped = await heroCredit(policyConfig());
    expect(capped.creditBasisText.value).toBe("最高抵 $50.00");

    // Below the cap the total IS days × rate, so the rate line stays the basis.
    const under = await heroCredit({ trialDays: 3, shadowDailyUSD: 1, trialOffsetCapUSD: 50 });
    expect(under.trialView.estimatedOffsetUSD.value).toBe(3);
    expect(under.estimateText.value).toBe("$3.00");
    expect(under.dailyEarnText.value).toBe("1.00/d × 3");
    expect(under.creditBasisText.value).toBe(under.dailyEarnText.value);
  });
});

describe("trial offer labels hold through a background read", () => {
  it("keeps the confirmed hero and promo CTA copy while a poll is in flight", async () => {
    const trial = useFreeTrial();
    remote.state.mockResolvedValueOnce(authority());
    await trial.refreshRemote();
    const { claimCtaText } = actual(hero, ["eligibility", "productUnavailable", "capacityFull", "claimCtaText"], {
      computed, trial, t: computed(() => zh), lifecycleCopy: computed(() => trialLifecycleCopy.zh),
    });
    const { claimLabel } = actual(banner, ["claimLabel"], { computed, trial, t: computed(() => zh) });
    expect(claimCtaText.value).toBe("立即领取");
    expect(claimLabel.value).toBe("马上领取");
    expect(trial.authorityStatus).toBe("ready");
    expect(trial.canStart()).toBe(true);

    let resolvePoll!: (value: TrialAuthorityState) => void;
    const promise = new Promise<TrialAuthorityState>((done) => { resolvePoll = done; });
    remote.state.mockReturnValueOnce(promise);
    const poll = trial.poll(Date.now());
    expect(remote.state).toHaveBeenCalledTimes(2);
    expect(trial.authorityStatus).toBe("loading");
    expect(claimCtaText.value).toBe("立即领取");
    expect(claimLabel.value).toBe("马上领取");
    expect(trial.canStart()).toBe(false);
    resolvePoll(authority());
    await poll;
    expect(claimCtaText.value).toBe("立即领取");
    expect(claimLabel.value).toBe("马上领取");
    expect(trial.authorityStatus).toBe("ready");
    expect(trial.canStart()).toBe(true);
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

  it("withholds an unconfirmed duration and retains a confirmed duration during polling", async () => {
    const freeTrial = useFreeTrial();
    const trialCfg = useTrialConfig();
    const { idleBody } = actual(trialPage, ["idleBody"], {
      computed, freeTrial, cfg: computed(() => trialCfg.config), w: computed(() => zh.trial), fmt,
    });
    expect(idleBody.value).toBe("");
    remote.state.mockRejectedValueOnce(new Error("unavailable"));
    await freeTrial.refreshRemote();
    expect(idleBody.value).toBe("");
    remote.state.mockResolvedValueOnce({ ...authority(), config: { ...authority().config, trialDays: "7" } });
    await freeTrial.refreshRemote();
    const confirmed = fmt(zh.trial.idleBody, { n: "7" });
    expect(idleBody.value).toBe(confirmed);
    freeTrial.authorityStatus = "loading";
    expect(idleBody.value).toBe(confirmed);
    remote.state.mockRejectedValueOnce(new Error("unavailable"));
    await freeTrial.refreshRemote();
    expect(idleBody.value).toBe("");
    freeTrial.authorityStatus = "mock";
    expect(idleBody.value).toBe(confirmed);
  });
});
