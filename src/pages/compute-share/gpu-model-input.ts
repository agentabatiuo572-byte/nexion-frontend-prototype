import { matchGpuTier } from "@/lib/gpu-tiers";
import type { GpuTier } from "@/store/config-types";

export function normalizeRequestedGpuModel(model: string): string {
  return model.trim().replace(/\s+/g, " ");
}

export function isRequestedGpuModelValid(model: string): boolean {
  const length = normalizeRequestedGpuModel(model).length;
  return length >= 3 && length <= 128;
}

// This page shows a configured match only. The shared legacy matcher has a
// fallback tier for other consumers; it is not evidence about entered hardware.
export function requestedGpuTier(model: string, tiers: GpuTier[]): GpuTier | null {
  const normalized = normalizeRequestedGpuModel(model).toLowerCase();
  if (!normalized || !tiers.some(tier => tier.keywords.some(keyword => {
    const key = normalizeRequestedGpuModel(keyword).toLowerCase();
    return key.length > 0 && normalized.includes(key);
  }))) return null;
  return matchGpuTier(model, tiers);
}
