import type { GpuTier, GpuTierId } from "@/store/config-types";

// SPEC-2 M6 single source. PROD replacement:
// GET /api/config/gpu-tiers -> GpuTier[]
export const GPU_TIERS: GpuTier[] = [
  {
    id: "G1",
    label: "Entry GPU",
    keywords: ["gtx 1650", "gtx 1060", "gtx 1050", "integrated", "iris xe", "vega"],
    tops: 40,
  },
  {
    id: "G2",
    label: "Standard GPU",
    keywords: ["rtx 3060", "rtx 3050", "rtx 2060", "gtx 1080", "rx 6600"],
    tops: 90,
  },
  {
    id: "G3",
    label: "Advanced GPU",
    keywords: ["rtx 4060 ti", "rtx 4060", "rtx 3070", "rx 7600", "rx 6700"],
    tops: 160,
  },
  {
    id: "G4",
    label: "High GPU",
    keywords: ["rtx 4070 ti", "rtx 4070", "rtx 3080", "rx 7800"],
    tops: 290,
  },
  {
    id: "G5",
    label: "Ultra GPU",
    keywords: ["rtx 5080", "rtx 4080", "rx 7900", "a5000"],
    tops: 460,
  },
  {
    id: "G6",
    label: "Flagship GPU",
    keywords: ["rtx 5090", "rtx 4090", "h100", "a100", "l40"],
    tops: 660,
  },
];

const GPU_TIER_RANK: Record<GpuTierId, number> = {
  G1: 1,
  G2: 2,
  G3: 3,
  G4: 4,
  G5: 5,
  G6: 6,
};

function normalizeGpuName(model: string): string {
  return model.trim().toLowerCase().replace(/\s+/g, " ");
}

export function matchGpuTier(model: string, tiers: GpuTier[] = GPU_TIERS): GpuTier {
  const normalized = normalizeGpuName(model);
  const sorted = [...tiers].sort((a, b) => {
    const rank = GPU_TIER_RANK[b.id] - GPU_TIER_RANK[a.id];
    if (rank !== 0) return rank;
    return b.tops - a.tops;
  });
  for (const tier of sorted) {
    const keywords = [...tier.keywords].sort((a, b) => b.length - a.length);
    if (keywords.some((keyword) => normalized.includes(normalizeGpuName(keyword)))) {
      return tier;
    }
  }
  return tiers.find((tier) => tier.id === "G2") ?? tiers[0];
}

export function assertGpuTiersMonotonic(tiers: GpuTier[] = GPU_TIERS): boolean {
  const sorted = [...tiers].sort((a, b) => GPU_TIER_RANK[a.id] - GPU_TIER_RANK[b.id]);
  return sorted.every((tier, index) => index === 0 || tier.tops > sorted[index - 1].tops);
}

export function gpuTierDailyRate(tier: GpuTier): number {
  return +((tier.tops / 28) * 0.06).toFixed(2);
}

export function gpuTierDailyNex(tier: GpuTier): number {
  return +(gpuTierDailyRate(tier) * 166.67).toFixed(1);
}

export function gpuTierVram(tier: GpuTier): number {
  const byTier: Record<GpuTierId, number> = { G1: 4, G2: 8, G3: 12, G4: 16, G5: 20, G6: 24 };
  return byTier[tier.id];
}
