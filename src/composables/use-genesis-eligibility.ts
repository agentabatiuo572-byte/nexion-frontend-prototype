import { computed, type ComputedRef } from "vue";
import {
  useGenesis,
  GENESIS_ELIGIBILITY_POLICY,
  evaluateGenesisSalePolicy,
  type GenesisGateResult,
} from "@/store/genesis";
import { remoteApiEnabled } from "@/api/runtime";

/**
 * 创世资格统一投影。生产环境只消费服务端新策略；5174 使用相同字段的离线镜像。
 */

export interface UseGenesisEligibilityResult {
  gate: ComputedRef<GenesisGateResult>;
  eligible: ComputedRef<boolean>;
  /** 新策略固定覆盖一级认购与二级承接。 */
  gatesSecondary: ComputedRef<boolean>;
}

export function useGenesisEligibility(): UseGenesisEligibilityResult {
  const genesis = useGenesis();

  const localGate = computed<GenesisGateResult>(() => evaluateGenesisSalePolicy(GENESIS_ELIGIBILITY_POLICY, {
      accountAgeDays: 0,
      myOwned: genesis.myOwned,
    }));
  const gate = computed<GenesisGateResult>(() => {
    if (!remoteApiEnabled) return localGate.value;
    const remote = genesis.remoteEligibility;
    const capRemaining = remote?.remainingCap ?? 0;
    const eligible = remote?.eligible === true && genesis.remoteHalted !== true;
    return {
      eligible,
      reasons: remote?.reasons ?? [genesis.remoteEligibilityError ?? "GENESIS_ELIGIBILITY_UNAVAILABLE"],
      capReached: capRemaining <= 0,
      capRemaining,
    };
  });

  const eligible = computed(() => gate.value.eligible);
  const gatesSecondary = computed(() => true);

  return { gate, eligible, gatesSecondary };
}
