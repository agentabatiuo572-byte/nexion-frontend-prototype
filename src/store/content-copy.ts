import { defineStore } from "pinia";
import { computed, ref } from "vue";
import type { LocaleCode } from "@/i18n";
import type { ManagedCopyDelivery } from "@/api/content-copy-api";
import { contentCopyApi, remoteApiEnabled } from "@/api/runtime";
import { remoteAccountScope } from "@/lib/remote-account-epoch";

export type ManagedCopyLoadStatus = "fallback" | "loading" | "ready" | "error";

export const useContentCopy = defineStore("content-copy", () => {
  const deliveries = ref<Record<string, ManagedCopyDelivery>>({});
  const status = ref<Record<string, ManagedCopyLoadStatus>>({});
  const errors = ref<Record<string, string>>({});
  const refreshes = new Map<string, Promise<void>>();

  async function refresh(positionKey: string, force = false): Promise<void> {
    if (!remoteApiEnabled) {
      status.value = { ...status.value, [positionKey]: "fallback" };
      return;
    }
    if (!force && status.value[positionKey] === "ready") return;
    const inFlight = refreshes.get(positionKey);
    if (inFlight) return inFlight;
    const scopeRequest = remoteAccountScope.snapshot();
    status.value = { ...status.value, [positionKey]: "loading" };
    const promise = contentCopyApi.byPosition(positionKey)
      .then((copy) => {
        if (!remoteAccountScope.isCurrent(scopeRequest)) return;
        deliveries.value = { ...deliveries.value, [positionKey]: copy };
        errors.value = { ...errors.value, [positionKey]: "" };
        status.value = { ...status.value, [positionKey]: "ready" };
      })
      .catch((error: unknown) => {
        if (!remoteAccountScope.isCurrent(scopeRequest)) return;
        const next = { ...deliveries.value };
        delete next[positionKey];
        deliveries.value = next;
        errors.value = {
          ...errors.value,
          [positionKey]: error instanceof Error ? error.message : "CONTENT_COPY_UNAVAILABLE",
        };
        status.value = { ...status.value, [positionKey]: "error" };
      })
      .finally(() => {
        if (refreshes.get(positionKey) === promise) refreshes.delete(positionKey);
      });
    refreshes.set(positionKey, promise);
    return promise;
  }

  function localized(positionKey: string, locale: LocaleCode): string | null {
    const copy = deliveries.value[positionKey];
    if (!copy) return null;
    if (locale === "zh") return copy.zh;
    if (locale === "vi") return copy.vi;
    return copy.en;
  }

  const assignedExperimentIds = computed(() => Array.from(new Set(
    Object.values(deliveries.value)
      .map((copy) => copy.experimentId)
      .filter((value): value is string => !!value),
  )));

  async function reportOrderConversions(orderNos: string[]): Promise<void> {
    if (!remoteApiEnabled || assignedExperimentIds.value.length === 0) return;
    const scopeRequest = remoteAccountScope.snapshot();
    const uniqueOrders = Array.from(new Set(orderNos.map((value) => value.trim()).filter(Boolean)));
    if (!remoteAccountScope.isCurrent(scopeRequest)) return;
    await Promise.allSettled(
      assignedExperimentIds.value.flatMap((experimentId) =>
        uniqueOrders.map((orderNo) => contentCopyApi.convert(experimentId, orderNo))),
    );
  }

  function clear(): void {
    deliveries.value = {};
    status.value = {};
    errors.value = {};
    refreshes.clear();
  }

  return {
    deliveries,
    status,
    errors,
    assignedExperimentIds,
    refresh,
    localized,
    reportOrderConversions,
    clear,
  };
});
