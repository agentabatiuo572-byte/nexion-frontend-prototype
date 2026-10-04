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

export async function refreshEarnConfig(): Promise<void> {
  if (!remoteApiEnabled) return;
  const version = ++loadVersion;
  status.value = "loading";
  error.value = "";
  try {
    // 🔴 两份**互不相干**的权威文档,不许用 Promise.all 绑成一次全有或全无
    //    (zentao #28)。task-pricing 是任务定价,phone-tiers 是手机档位收益基准;
    //    前者读失败(例如老后端没有 nx_admin_device_task 行、或 6 类任务数对不上)
    //    此前会把 phoneTiers 一起清空,于是商城主列表仍显示「你的手机 $0.06/天」
    //    (那个数来自用户自己的设备投影),详情页的「你的手机」却变成「暂无数据」——
    //    同一基准跨页矛盾,而根因只是一个不相干的请求失败。
    //    与 E5 同款修法:各读各的,单面失败只降级那一面。
    const [pricingResult, tiersResult] = await Promise.allSettled([
      earnConfigApi.taskPricing(),
      earnConfigApi.phoneTiers(),
    ]);
    if (version !== loadVersion) return;
    if (pricingResult.status === "fulfilled") {
      taskPricing.value = pricingResult.value;
    } else {
      taskPricing.value = null;
    }
    if (tiersResult.status === "fulfilled") {
      phoneTiers.value = tiersResult.value;
      applyCanonicalPhoneTierYields(tiersResult.value.tiers);
    } else {
      phoneTiers.value = null;
      applyCanonicalPhoneTierYields([]);
    }
    // 只有两面都读到才算 ready;单面失败仍报错,但**另一面的数据保留在内存里**,
    // 消费方据此各自降级,而不是被一起清空。
    const failures = [pricingResult, tiersResult].filter((r) => r.status === "rejected");
    if (failures.length === 0) {
      status.value = "ready";
      error.value = "";
    } else {
      status.value = "error";
      const first = failures[0] as PromiseRejectedResult;
      error.value = first.reason instanceof Error ? first.reason.message : "E2_CONFIG_UNAVAILABLE";
    }
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
      unlockTier: `${row.minVRAM}GB VRAM`,
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
