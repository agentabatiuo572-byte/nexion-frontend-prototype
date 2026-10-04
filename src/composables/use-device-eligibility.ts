import { computed, type ComputedRef } from "vue";
import type { Device, DeviceKind } from "@/store/types";
import { useApp } from "@/store/app";
import { useVRank } from "@/store/v-rank";
import { useNetwork } from "@/store/network";
import { trialReservesSlotNow } from "@/store/free-trial";
import {
  checkEligibility,
  eligibleTradeInDevices,
  type EligibilityContext,
  type EligibilityResult,
} from "@/mock/eligibility";
import { DEFAULT_TRADEIN_CONFIG } from "@/mock/tradein-config";

/**
 * useDeviceEligibility — Vue composable port of
 * Nexion-prototype/lib/hooks/use-device-eligibility.ts.
 *
 * Composes 3 Pinia stores (app / v-rank / network) into an
 * EligibilityContext and evaluates it against TRADEIN_CONFIG. Cross-store
 * composition lives at the COMPONENT/PAGE layer (this composable is called from
 * a page's setup, never from a store) so the architecture rule "stores never
 * import each other" (PITFALLS P-031/032) holds.
 *
 * ⚠️ MOCK-ONLY: client-side eligibility is UI affordance only (which sheet to
 * open). Production: GET /api/devices/eligibility?kind=X is sole authority.
 *
 * Returns reactive computeds — read `.value` in the consuming page.
 */
export interface UseDeviceEligibilityResult {
  /** Full eligibility evaluation (eligible / mode / passed / missing). */
  result: ComputedRef<EligibilityResult>;
  /** True if the user owns ≥1 device retirable toward the target kind. */
  canTradeIn: ComputedRef<boolean>;
  /** FEAT-DEV02:可下架抵扣本目标的设备清单(设备级,按可抵额降序)。 */
  tradeInSources: ComputedRef<Device[]>;
  /** True when active slots are at MAX_DEVICES (Path B slot-full prompt). */
  capped: ComputedRef<boolean>;
}

export function useDeviceEligibility(
  kind: DeviceKind,
  tradeInFromKind: DeviceKind | null = null,
): UseDeviceEligibilityResult {
  const app = useApp();
  const vRank = useVRank();
  const network = useNetwork();

  // EligibilityContext rebuilt reactively from the store refs.
  // 设备资格只依据当前有效的账户与设备规则。
  const ctx = computed<EligibilityContext>(() => ({
    devices: app.visibleDevices,
    vRank: vRank.myRank,
    cumulativeDepositUsdt: app.user.cumulativeDepositUsdt,
    accountCreatedAt: app.user.joinedAt,
    // Direct referrals excluding system spillover (real-platform "your referrals").
    referralConfirmedCount: network.members.filter(
      (m) => m.layer === 1 && !m.isSpillover,
    ).length,
    tradeInFromKind,
  }));

  const result = computed(() =>
    checkEligibility(kind, DEFAULT_TRADEIN_CONFIG, ctx.value),
  );
  const tradeInSources = computed(() =>
    eligibleTradeInDevices(kind, DEFAULT_TRADEIN_CONFIG, ctx.value),
  );
  const canTradeIn = computed(() => tradeInSources.value.length > 0);
  const reservedSlots = computed(() => (trialReservesSlotNow() ? 1 : 0));
  const capped = computed(() => app.activeSlotCount + reservedSlots.value >= app.slotCap);

  return { result, canTradeIn, tradeInSources, capped };
}
