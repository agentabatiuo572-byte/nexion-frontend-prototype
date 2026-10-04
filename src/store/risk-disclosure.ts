import { defineStore } from "pinia";
import { ref } from "vue";
import { remoteApiEnabled, riskDisclosureApi, sessionVault } from "@/api/runtime";
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
  const publicationUnavailable = ref(false);
  /** Region routing is not provisioned (or is ambiguous) — retrying the same request cannot help. */
  const jurisdictionUnmapped = ref(false);
  let requestGeneration = 0;

  function apply(snapshot: RiskDisclosureCurrent | null) {
    publicationUnavailable.value = false;
    jurisdictionUnmapped.value = false;
    current.value = snapshot;
    accepted.value = snapshot?.acknowledged ?? false;
    acceptedAt.value = snapshot?.acknowledgedAt ? Date.parse(snapshot.acknowledgedAt) || null : null;
  }
  function beginRequest() {
    return { request: remoteAccountScope.snapshot(), generation: ++requestGeneration };
  }
  function requestIsCurrent(request: ReturnType<typeof remoteAccountScope.snapshot>, generation: number) {
    return requestGeneration === generation && remoteAccountScope.isCurrent(request);
  }
  function invalidateRequests() { requestGeneration += 1; }
  async function refresh(publicCountry?: string | null) {
    const { request, generation } = beginRequest();
    const authenticated = !!sessionVault.read();
    apply(null);
    error.value = null;
    if (!remoteApiEnabled) {
      if (requestIsCurrent(request, generation)) {
        error.value = "RISK_DISCLOSURE_REMOTE_REQUIRED";
        loading.value = false;
      }
      return;
    }
    if (!authenticated && !publicCountry) {
      if (requestIsCurrent(request, generation)) error.value = "RISK_DISCLOSURE_COUNTRY_REQUIRED";
      return;
    }
    loading.value = true;
    try {
      const snapshot = await (authenticated
        ? riskDisclosureApi.current()
        : riskDisclosureApi.publicCurrent(publicCountry!));
      if (requestIsCurrent(request, generation)) apply(snapshot);
    } catch (cause) {
      if (requestIsCurrent(request, generation)) {
        apply(null);
        publicationUnavailable.value = cause instanceof ApiError && cause.kind === "http"
          && cause.status === 404 && cause.code === 404
          && cause.message === "RISK_DISCLOSURE_PUBLISHED_VERSION_NOT_FOUND";
        jurisdictionUnmapped.value = cause instanceof ApiError && cause.kind === "http"
          && (cause.message === "RISK_DISCLOSURE_JURISDICTION_NOT_CONFIGURED"
              || cause.message === "RISK_DISCLOSURE_JURISDICTION_AMBIGUOUS");
        error.value = cause instanceof Error ? cause.message : "RISK_DISCLOSURE_UNAVAILABLE";
      }
    } finally {
      if (requestIsCurrent(request, generation)) loading.value = false;
    }
  }
  async function accept() {
    if (!sessionVault.read() || !current.value?.acknowledgmentToken || accepted.value) return false;
    const { request, generation } = beginRequest();
    const disclosure = current.value;
    loading.value = true;
    error.value = null;
    try {
      await riskDisclosureApi.acknowledge(disclosure);
      if (!requestIsCurrent(request, generation)) return false;
      // The command response cannot supersede a newer authoritative snapshot.
      const snapshot = await riskDisclosureApi.current();
      if (!requestIsCurrent(request, generation)) return false;
      apply(snapshot);
      return accepted.value;
    } catch (cause) {
      if (requestIsCurrent(request, generation)) {
        apply(null);
        publicationUnavailable.value = cause instanceof ApiError && cause.kind === "http"
          && cause.status === 404 && cause.code === 404
          && cause.message === "RISK_DISCLOSURE_PUBLISHED_VERSION_NOT_FOUND";
        jurisdictionUnmapped.value = cause instanceof ApiError && cause.kind === "http"
          && (cause.message === "RISK_DISCLOSURE_JURISDICTION_NOT_CONFIGURED"
              || cause.message === "RISK_DISCLOSURE_JURISDICTION_AMBIGUOUS");
        error.value = cause instanceof Error ? cause.message : "RISK_DISCLOSURE_ACKNOWLEDGEMENT_FAILED";
      }
      return false;
    } finally {
      if (requestIsCurrent(request, generation)) loading.value = false;
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
  function bindAccount() { invalidateRequests(); apply(null); void refresh(); }
  function reset() { invalidateRequests(); apply(null); void refresh(); }
  return { current, accepted, acceptedAt, loading, error, publicationUnavailable, jurisdictionUnmapped, refresh, accept, checkGate, reset, bindAccount };
});
