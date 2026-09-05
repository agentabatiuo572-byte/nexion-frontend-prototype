import { computed, type ComputedRef } from "vue";
import { useApp } from "@/store/app";
import { getPhaseParams, PHASES, resolveActivePhase, type PhaseParams } from "@/store/product-phase";
import { remoteApiEnabled } from "@/api/runtime";
import { refreshServerProductPhase, serverProductPhaseState } from "@/store/server-product-phase";

/**
 * Ported from Nexion-prototype/lib/hooks/use-product-phase.ts.
 *
 * Returns a reactive ComputedRef of the active platform phase + its params.
 * Remote mode mirrors GET /api/product/phase (H1); only the isolated mock mode
 * keeps the account-age/demo derivation. This prevents a newly signed-in user
 * from locally downgrading the global storefront phase back to P1.
 *
 * Usage in <script setup>: `const phase = useProductPhase()` then read
 * `phase.value`; in templates `phase.id`.
 */
export function useProductPhase(): ComputedRef<PhaseParams> {
  const app = useApp();
  if (remoteApiEnabled && serverProductPhaseState.status !== "ready") {
    void refreshServerProductPhase();
  }
  return computed(() => {
    if (!remoteApiEnabled) return resolveActivePhase(app.user.joinedAt);
    if (serverProductPhaseState.status === "ready" && serverProductPhaseState.phase) {
      return getPhaseParams(serverProductPhaseState.phase);
    }
    // Remote mode must never derive a release phase from client account age.
    // P1 is the closed-side placeholder while H1 is loading or unavailable.
    return PHASES[0];
  });
}
