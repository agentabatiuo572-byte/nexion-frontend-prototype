import { computed, ref } from "vue";
import { earnConfigApi, remoteApiEnabled } from "@/api/runtime";
import type { EarnPhoneTiers, EarnTaskPricing, EarnTaskRoute, TaskClass } from "@/api/earn-config-api";
import { applyCanonicalPhoneTierYields } from "@/mock/phone-tiers";
import { TASK_CATEGORY_LABEL } from "@/store/types";
import type { LockedTeaser } from "@/mock/tasks";
import { avgEligibleReward as mockAvgEligibleReward, getLockedTeasers as getMockLockedTeasers } from "@/mock/tasks";

type EarnConfigStatus = "idle" | "loading" | "ready" | "error";

const taskPricing = ref<EarnTaskPricing | null>(null);
const phoneTiers = ref<EarnPhoneTiers | null>(null);
const status = ref<EarnConfigStatus>("idle");
const error = ref("");
const route = ref<EarnTaskRoute | null>(null);
const routeError = ref("");
let loadVersion = 0;

// The mutable compatibility table is consumed by legacy presentation code.
// Clear its prototype rows immediately in server mode; only a validated
// /api/config/phone-tiers response is allowed to repopulate it.
if (remoteApiEnabled) applyCanonicalPhoneTierYields([]);

function unlockTierFor(minVRAM: number): string {
  if (minVRAM <= 24) return "RTX 4090 PC (24GB)";
  if (minVRAM <= 96) return "NexGridBox S1 (96GB)";
  if (minVRAM <= 192) return "NexGridBox Pro (192GB)";
  return "NexGridRack P1 (640GB)";
}

export async function refreshEarnConfig(): Promise<void> {
  if (!remoteApiEnabled) return;
  const version = ++loadVersion;
  status.value = "loading";
  error.value = "";
  try {
    const [nextPricing, nextTiers] = await Promise.all([
      earnConfigApi.taskPricing(),
      earnConfigApi.phoneTiers(),
    ]);
    if (version !== loadVersion) return;
    taskPricing.value = nextPricing;
    phoneTiers.value = nextTiers;
    applyCanonicalPhoneTierYields(nextTiers.tiers);
    status.value = "ready";
  } catch (cause) {
    if (version !== loadVersion) return;
    taskPricing.value = null;
    phoneTiers.value = null;
    applyCanonicalPhoneTierYields([]);
    status.value = "error";
    error.value = cause instanceof Error ? cause.message : "E2_CONFIG_UNAVAILABLE";
  }
}

export function prepareEarnConfig(): void {
  if (remoteApiEnabled && status.value === "idle") void refreshEarnConfig();
}

async function refreshRoute(deviceVramGb: number): Promise<void> {
  if (!remoteApiEnabled) return;
  routeError.value = "";
  try {
    route.value = await earnConfigApi.route(deviceVramGb);
  } catch (cause) {
    route.value = null;
    routeError.value = cause instanceof Error ? cause.message : "E2_TASK_ROUTE_UNAVAILABLE";
  }
}

function lockedTeasers(maxVram: number, count = 3): LockedTeaser[] {
  if (!remoteApiEnabled) return getMockLockedTeasers(maxVram, count);
  const pricing = taskPricing.value;
  if (!pricing) return [];
  return pricing.taskClasses
    .filter((row) => row.enabled && row.minVRAM > maxVram)
    .sort((left, right) => left.minVRAM - right.minVRAM)
    .slice(0, count)
    .map((row) => ({
      category: row.taskClass as TaskClass,
      type: TASK_CATEGORY_LABEL[row.taskClass],
      model: row.models[0] || row.taskName,
      minVRAM: row.minVRAM,
      rewardHint: `$${row.minReward.toFixed(3)}-$${row.maxReward.toFixed(2)}`,
      dailyPotentialUSD: Math.max(0, Math.round(row.dailyPotential)),
      unlockTier: unlockTierFor(row.minVRAM),
    }));
}

function averageEligibleReward(maxVram: number): number {
  if (!remoteApiEnabled) return mockAvgEligibleReward(maxVram);
  const eligible = taskPricing.value?.taskClasses.filter((row) => row.enabled && row.minVRAM <= maxVram) ?? [];
  if (!eligible.length) return 0;
  return eligible.reduce((sum, row) => sum + (row.minReward + row.maxReward) / 2, 0) / eligible.length;
}

export function useEarnConfig() {
  return {
    status: computed(() => status.value),
    error: computed(() => error.value),
    taskPricing: computed(() => taskPricing.value),
    phoneTiers: computed(() => phoneTiers.value),
    route: computed(() => route.value),
    routeError: computed(() => routeError.value),
    lockedTeasers,
    averageEligibleReward,
    refresh: refreshEarnConfig,
    refreshRoute,
  };
}
