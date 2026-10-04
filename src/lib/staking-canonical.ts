import type { StakingPool, StakingTerm } from "@/api/staking-api";

export interface StakingConfigState {
  isMockMode: boolean;
  remoteReady: boolean;
  pools: readonly StakingPool[];
}

export interface LocalStakingPoolValues {
  apy: number;
  penalty: number;
  minAmountUsdt: number;
}

export interface StakingPoolAmountGate {
  minAmountUsdt: number;
}

export function canOpenStakingPool(state: StakingConfigState, termDays: StakingTerm | null): boolean {
  if (termDays === null) return false;
  if (state.isMockMode) return true;
  if (!state.remoteReady) return false;
  const pool = state.pools.find((candidate) => candidate.termDays === termDays);
  return !!pool && pool.enabled && !pool.killed && pool.status === "ACTIVE";
}

/**
 * A withdrawal alternative is a purchase recommendation, so it must be both
 * open in the current server snapshot and affordable for the entered amount.
 * The caller supplies the same resolved pool used for the displayed APY; this
 * keeps mock-mode local values behind the existing explicit mock boundary.
 */
export function canRecommendStakingPool(
  state: StakingConfigState,
  termDays: StakingTerm | null,
  amountUsdt: number,
  pool: StakingPoolAmountGate | null,
): boolean {
  return Number.isFinite(amountUsdt)
    && amountUsdt > 0
    && state.remoteReady
    && !!pool
    && Number.isFinite(pool.minAmountUsdt)
    && pool.minAmountUsdt > 0
    && amountUsdt >= pool.minAmountUsdt
    && canOpenStakingPool(state, termDays);
}

/**
 * Resolve display configuration with an explicit mock boundary.
 * Remote callers get no value until the parsed server snapshot is ready;
 * callers must render an unavailable state instead of inventing a rate.
 */
export function resolveStakingPool(
  state: StakingConfigState,
  termDays: StakingTerm,
  local?: LocalStakingPoolValues,
): StakingPool | (LocalStakingPoolValues & { termDays: StakingTerm }) | null {
  if (state.isMockMode) return local ? { termDays, ...local } : null;
  if (!state.remoteReady) return null;
  return state.pools.find((pool) => pool.termDays === termDays) ?? null;
}

/**
 * Early-withdraw confirmation must use the canonical position snapshot in
 * remote mode. The local table is intentionally only available to mock mode.
 */
export function resolvePositionPenalty(
  position: { penalty?: unknown },
  isMockMode: boolean,
  localPenalty?: number,
): number | null {
  if (isMockMode && localPenalty !== undefined) return localPenalty;
  const penalty = typeof position.penalty === "number" ? position.penalty : Number(position.penalty);
  return Number.isFinite(penalty) && penalty >= 0 && penalty <= 1 ? penalty : null;
}
