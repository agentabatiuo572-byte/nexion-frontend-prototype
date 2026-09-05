import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { PhaseId } from "@/store/product-phase";

const PHASES = new Set<PhaseId>(["P1", "P2", "P3", "P4", "P5", "P6"]);

export interface ProductPhaseSnapshot {
  phase: PhaseId;
  source: "H1_GROWTH_RHYTHM";
}

export interface ProductPhaseApi {
  current(): Promise<ProductPhaseSnapshot>;
}

function parseProductPhase(value: unknown): ProductPhaseSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError({ kind: "protocol", message: "PRODUCT_PHASE_RESPONSE_INVALID" });
  }
  const row = value as Record<string, unknown>;
  if (!PHASES.has(row.phase as PhaseId) || row.source !== "H1_GROWTH_RHYTHM"
      || row.devOverrideAllowed !== false) {
    throw new ApiError({ kind: "protocol", message: "PRODUCT_PHASE_RESPONSE_INVALID" });
  }
  return { phase: row.phase as PhaseId, source: "H1_GROWTH_RHYTHM" };
}

export function createProductPhaseApi(client: ApiClient): ProductPhaseApi {
  return {
    async current() {
      return parseProductPhase(await client.request<unknown>({ path: "/api/product/phase" }));
    },
  };
}
