import { computed, unref, type Ref } from "vue";
import type { Product, GateResult } from "@/mock/products";
import { evaluatePurchaseGate } from "@/mock/products";
import { useVRank } from "@/store/v-rank";
import { useNetwork } from "@/store/network";

// Reactive purchase-gate state for a product — the single source consumed by
// product-card / detail / checkout / quota. Reads live eligibility (V-rank +
// active direct-invite count + team volume) from the stores and runs the pure
// evaluatePurchaseGate(). Pass a Product ref or a getter returning it.
export function usePurchaseGate(
  product: Ref<Product | undefined> | (() => Product | undefined),
) {
  const vRank = useVRank();
  const network = useNetwork();

  const activeDirect = computed(
    () => network.members.filter((m) => m.layer === 1 && m.status === "active").length,
  );

  const gate = computed<GateResult>(() => {
    const p = typeof product === "function" ? product() : unref(product);
    if (!p) {
      return {
        gated: false, eligible: true, soldOut: false, blocked: false,
        remaining: null, conditions: [], unmet: [], progressPct: 1,
      };
    }
    return evaluatePurchaseGate(p, {
      rank: vRank.myRank,
      activeDirect: activeDirect.value,
      teamVolumeUSD: vRank.teamVolumeUSD,
    });
  });

  return { gate, activeDirect };
}
