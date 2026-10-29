import { ref } from "vue";
import { trustDocumentApi } from "@/api/runtime";
import type { TrustDocuments } from "@/api/trust-document-api";
import { subscribeRuntimeRevision } from "@/api/order-api";

// Shared by the trust centre and the white paper page; one read per runtime generation.
const documents = ref<TrustDocuments | null>(null);
const status = ref<"idle" | "loading" | "ready" | "error">("idle");
let inflight: Promise<boolean> | null = null;
let authorityGeneration = 0;

// A new runtime generation re-reads once something has asked for the documents;
// the last list stays on screen until the new one arrives.
subscribeRuntimeRevision(() => {
  authorityGeneration += 1;
  inflight = null;
  if (status.value !== "idle") void refreshTrustDocuments();
});

export function refreshTrustDocuments(): Promise<boolean> {
  if (inflight) return inflight;
  status.value = "loading";
  const generation = authorityGeneration;
  const operation = trustDocumentApi.current().then((next) => {
    if (generation !== authorityGeneration) return false;
    documents.value = next;
    status.value = "ready";
    return true;
  }).catch(() => {
    if (generation !== authorityGeneration) return false;
    status.value = "error";
    return false;
  });
  inflight = operation;
  void operation.finally(() => {
    if (inflight === operation) inflight = null;
  });
  return operation;
}

export function useTrustDocuments() {
  return { documents, status, refresh: refreshTrustDocuments };
}
