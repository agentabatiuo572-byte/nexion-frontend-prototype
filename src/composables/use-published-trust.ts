import { ref } from "vue";
import { trustSectionApi } from "@/api/runtime";
import type { PublishedTrustSection, TrustLocale } from "@/api/trust-section-api";
import { subscribeCurrentCommerceSandboxRun } from "@/api/order-api";

const sections = ref<PublishedTrustSection[]>([]);
const status = ref<"idle" | "loading" | "ready" | "error">("idle");
let inflight: Promise<boolean> | null = null;
let authorityGeneration = 0;

subscribeCurrentCommerceSandboxRun(() => {
  authorityGeneration += 1;
  inflight = null;
  sections.value = [];
  status.value = "idle";
});

export function refreshPublishedTrust(force = false): Promise<boolean> {
  if (!force && status.value === "ready") return Promise.resolve(true);
  if (inflight) return inflight;
  status.value = "loading";
  const generation = authorityGeneration;
  inflight = trustSectionApi.current().then((next) => {
    if (generation !== authorityGeneration) return false;
    sections.value = next;
    status.value = next.length ? "ready" : "error";
    return status.value === "ready";
  }).catch(() => {
    if (generation !== authorityGeneration) return false;
    sections.value = [];
    status.value = "error";
    return false;
  });
  const operation = inflight;
  void operation.finally(() => {
    if (inflight === operation) inflight = null;
  });
  return operation;
}

export function recordPublishedTrustViews(sectionKeys: string[], locale: TrustLocale): void {
  void Promise.allSettled(sectionKeys.map((sectionKey) => trustSectionApi.recordView(sectionKey, locale)));
}

export function usePublishedTrust() {
  return { sections, status, refresh: refreshPublishedTrust };
}
