import { defineStore } from "pinia";
import { ref } from "vue";
import { remoteApiEnabled, riskDisclosureApi } from "@/api/runtime";
import type { RiskDisclosureCurrent } from "@/api/risk-disclosure-api";
import { ApiError } from "@/api/errors";
import { remoteAccountScope } from "@/lib/remote-account-epoch";

/** The server disclosure/version is the only compliance fact; never persist an acknowledgement locally. */
export const useRiskDisclosure = defineStore("riskDisclosure", () => {
  const current = ref<RiskDisclosureCurrent | null>(null);
  const accepted = ref(false);
  const acceptedAt = ref<number | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  function apply(snapshot: RiskDisclosureCurrent | null) {
    current.value = snapshot;
    accepted.value = snapshot?.acknowledged ?? false;
    acceptedAt.value = snapshot?.acknowledgedAt ? Date.parse(snapshot.acknowledgedAt) || null : null;
  }
  async function refresh() {
    const request = remoteAccountScope.snapshot();
    apply(null);
    error.value = null;
    if (!remoteApiEnabled) { error.value = "RISK_DISCLOSURE_REMOTE_REQUIRED"; return; }
    loading.value = true;
    try {
      const snapshot = await riskDisclosureApi.current();
      if (remoteAccountScope.isCurrent(request)) apply(snapshot);
    } catch (cause) {
      if (remoteAccountScope.isCurrent(request)) {
        apply(null);
        error.value = cause instanceof Error ? cause.message : "RISK_DISCLOSURE_UNAVAILABLE";
      }
    } finally {
      if (remoteAccountScope.isCurrent(request)) loading.value = false;
    }
  }
  async function accept() {
    if (!current.value || accepted.value) return false;
    const request = remoteAccountScope.snapshot();
    const disclosure = current.value;
    loading.value = true;
    error.value = null;
    try {
      const snapshot = await riskDisclosureApi.acknowledge(disclosure);
      if (!remoteAccountScope.isCurrent(request)) return false;
      apply(snapshot);
      return accepted.value;
    } catch (cause) {
      if (remoteAccountScope.isCurrent(request)) {
        apply(null);
        error.value = cause instanceof Error ? cause.message : "RISK_DISCLOSURE_ACKNOWLEDGEMENT_FAILED";
      }
      return false;
    } finally {
      if (remoteAccountScope.isCurrent(request)) loading.value = false;
    }
  }
  async function checkGate(actionKey: string, operationId?: string): Promise<void> {
    if (!remoteApiEnabled) {
      throw new ApiError({ kind: "configuration", message: "RISK_DISCLOSURE_REMOTE_REQUIRED" });
    }
    const request = remoteAccountScope.snapshot();
    try {
      await riskDisclosureApi.checkGate(actionKey, operationId);
    } catch (cause) {
      if (!remoteAccountScope.isCurrent(request)) {
        throw new ApiError({ kind: "protocol", message: "RISK_DISCLOSURE_ACCOUNT_CONTEXT_STALE" });
      }
      throw cause;
    }
    if (!remoteAccountScope.isCurrent(request)) {
      throw new ApiError({ kind: "protocol", message: "RISK_DISCLOSURE_ACCOUNT_CONTEXT_STALE" });
    }
  }
  function bindAccount() { apply(null); void refresh(); }
  function reset() { apply(null); void refresh(); }
  return { current, accepted, acceptedAt, loading, error, refresh, accept, checkGate, reset, bindAccount };
});
