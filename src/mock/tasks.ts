// AI workload task templates per design doc §5.2.4 / §7.1 / §7.2.
// Each tick the simulator picks a template, picks a model variant,
// picks a client from the AI roster (§7.5), and assigns to a device.
//
// VRAM gating (P0-3, 2026-05-15): each model variant declares minVRAM.
// pickRandomTask(maxVram) filters templates+models to those that fit.
// getLockedTeasers(maxVram) returns examples a device CAN'T run, used
// by Task Center "Upgrade Unlocks" section to drive §1.3 Phase 3 conversion.

import type { CurrentTask, TaskCategory } from "../store/types";
import { TASK_CATEGORY_LABEL } from "../store/types";
import { pickClientFor } from "./ai-clients";

interface ModelVariant {
  name: string;
  minVRAM: number; // GB
}

export interface TaskTemplate {
  category: TaskCategory;
  models: ModelVariant[];
  // Duration window in seconds.
  minSec: number;
  maxSec: number;
  // Reward window in USDT for one job.
  // Tuned to match doc §7.1 unit prices × typical batch sizes.
  minReward: number;
  maxReward: number;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    category: "IG",
    models: [
      { name: "SDXL Turbo 512²", minVRAM: 4 },   // v3.2 mobile
      { name: "SDXL Lightning", minVRAM: 6 },
      { name: "SDXL 1.0 base", minVRAM: 8 },
      { name: "Flux.1 [schnell]", minVRAM: 12 },
      { name: "Pixart-Σ XL", minVRAM: 12 },
      { name: "Flux.1 [dev]", minVRAM: 16 },
    ],
    minSec: 30,
    maxSec: 180,
    minReward: 0.0001,  // mobile tier seed
    maxReward: 0.045,
  },
  {
    category: "VG",
    models: [
      { name: "Luma Dream Machine", minVRAM: 16 },
      { name: "Runway Gen-3 Alpha", minVRAM: 24 },
      { name: "Kling 2.0", minVRAM: 24 },
      { name: "Sora-class", minVRAM: 80 },
    ],
    minSec: 60,
    maxSec: 360,
    minReward: 0.45,
    maxReward: 1.8,
  },
  {
    category: "LL",
    models: [
      { name: "Phi-3-mini", minVRAM: 4 },          // v3.2 mobile
      { name: "Llama 3.2 1B", minVRAM: 4 },        // v3.2 mobile
      { name: "Llama 3.2 3B", minVRAM: 6 },        // v3.2 mobile
      { name: "Llama 3.1 8B", minVRAM: 10 },
      { name: "Mistral Large 2", minVRAM: 24 },
      { name: "Mixtral 8×22B", minVRAM: 48 },
      { name: "Llama 3.1 70B", minVRAM: 48 },
      { name: "Qwen 2.5 72B", minVRAM: 48 },
      { name: "Llama 3.1 405B", minVRAM: 200 },
    ],
    minSec: 30,
    maxSec: 480,
    minReward: 0.00005,  // mobile tier seed
    maxReward: 0.85,
  },
  {
    category: "FT",
    models: [
      { name: "QLoRA · Mistral 7B", minVRAM: 16 },
      { name: "LoRA · SDXL base", minVRAM: 16 },
      { name: "LoRA · Flux.1 [dev]", minVRAM: 24 },
      { name: "LoRA · Llama 3.1 8B", minVRAM: 24 },
      { name: "DPO · Llama 3.1 70B", minVRAM: 80 },
    ],
    minSec: 480,
    maxSec: 1800,
    minReward: 0.06,
    maxReward: 0.42,
  },
  {
    category: "EM",
    models: [
      { name: "MobileBERT", minVRAM: 4 },              // v3.2 mobile
      { name: "nomic-embed-text-mobile", minVRAM: 4 }, // v3.2 mobile
      { name: "nomic-embed-text-v1.5", minVRAM: 4 },
      { name: "bge-large-en-v1.5", minVRAM: 6 },
      { name: "text-embedding-3-large", minVRAM: 8 },
      { name: "jina-embeddings-v3", minVRAM: 8 },
    ],
    minSec: 60,
    maxSec: 900,
    minReward: 0.00001,  // mobile tier seed
    maxReward: 0.09,
  },
  {
    category: "SP",
    models: [
      { name: "Whisper-tiny", minVRAM: 4 },            // v3.2 mobile
      { name: "Whisper-base", minVRAM: 4 },            // v3.2 mobile
      { name: "Whisper-v3 turbo", minVRAM: 4 },
      { name: "Whisper-v3 large", minVRAM: 8 },
      { name: "F5-TTS", minVRAM: 8 },
      { name: "XTTS-v2", minVRAM: 8 },
      { name: "Bark TTS", minVRAM: 12 },
    ],
    minSec: 30,
    maxSec: 240,
    minReward: 0.00005,  // mobile tier seed
    maxReward: 0.072,
  },
];

// Counter is global so all task IDs across the session are monotonically
// increasing — gives the UI a "live job stream" feel.
let taskCounter = 78234;
function nextTaskNumber(): number {
  taskCounter += 1;
  return taskCounter;
}

// Pick a task that fits within maxVram. If maxVram is undefined or 0
// (e.g. cloud-share), no filtering applied (fallback to any task).
export function pickRandomTask(maxVram?: number): CurrentTask {
  const eligible =
    maxVram && maxVram > 0
      ? TASK_TEMPLATES.map((tpl) => ({
          tpl,
          models: tpl.models.filter((m) => m.minVRAM <= maxVram),
        })).filter((e) => e.models.length > 0)
      : TASK_TEMPLATES.map((tpl) => ({ tpl, models: tpl.models }));

  if (eligible.length === 0) {
    // Should never happen: even 4GB GPUs fit Whisper turbo / nomic-embed.
    // Fall back to any task to avoid crashing the device card.
    return buildTask(TASK_TEMPLATES[0], TASK_TEMPLATES[0].models[0]);
  }

  const pick = eligible[Math.floor(Math.random() * eligible.length)];
  const model = pick.models[Math.floor(Math.random() * pick.models.length)];
  return buildTask(pick.tpl, model);
}

function buildTask(tpl: TaskTemplate, model: ModelVariant): CurrentTask {
  const totalSec = tpl.minSec + Math.random() * (tpl.maxSec - tpl.minSec);
  const reward =
    tpl.minReward + Math.random() * (tpl.maxReward - tpl.minReward);
  const client = pickClientFor(tpl.category);
  return {
    id: `${tpl.category}-A${nextTaskNumber()}`,
    category: tpl.category,
    type: TASK_CATEGORY_LABEL[tpl.category],
    model: model.name,
    client: client.name,
    location: `${client.city}, ${client.country}`,
    totalSec: Math.round(totalSec),
    startedAt: Date.now(),
    reward: +reward.toFixed(3),
  };
}

// FEAT-DEV01: mean per-task reward across the templates a device of `maxVram`
// can actually book — display-only denominator for the device card's
// "≈N tasks booked today" line (tasksToday = dailyRateNow ÷ this). Derived from
// the same TASK_TEMPLATES the simulator draws from (single source), never
// persisted, deterministic (no RNG).
export function avgEligibleReward(maxVram?: number): number {
  const pools = TASK_TEMPLATES.map((tpl) => ({
    tpl,
    eligible: !maxVram || maxVram <= 0 ? tpl.models : tpl.models.filter((m) => m.minVRAM <= maxVram),
  })).filter((e) => e.eligible.length > 0);
  if (!pools.length) return (TASK_TEMPLATES[0].minReward + TASK_TEMPLATES[0].maxReward) / 2;
  const sum = pools.reduce((s, e) => s + (e.tpl.minReward + e.tpl.maxReward) / 2, 0);
  return sum / pools.length;
}

// ───── Upgrade Unlocks (locked-tier teasers for §5.2.4 Task Center) ─────

export interface LockedTeaser {
  category: TaskCategory;
  type: string;        // human label
  model: string;       // most attractive locked model in this category
  minVRAM: number;     // VRAM the user lacks
  rewardHint: string;  // e.g. "$0.18-$1.80" — per-task range (used in Nova copy)
  /**
   * Daily earnings potential in USD if the user owned the unlocked hardware.
   * Formula: (24h capacity × ~35% queue saturation) × avg reward per task.
   * Used in Task Center "Upgrade Unlocks" row to drive FOMO — concrete dollar
   * amounts convert better than per-task ranges.
   */
  dailyPotentialUSD: number;
  unlockTier: string;  // e.g. "NexGridBox S1 (96GB)"
}

// Realistic queue saturation. A real shared GPU pool isn't pegged at 100%
// — operators compete for jobs. 35% is the spec's reference figure.
const QUEUE_SATURATION = 0.35;

// Map a VRAM requirement to the cheapest device tier that satisfies it.
function unlockTierFor(minVRAM: number): string {
  if (minVRAM <= 24) return "RTX 4090 PC (24GB)";
  if (minVRAM <= 96) return "NexGridBox S1 (96GB)";
  if (minVRAM <= 192) return "NexGridBox Pro (192GB)";
  return "NexGridRack P1 (640GB)";
}

// Return up to `count` locked teasers — one per category that has at least
// one model currently out of reach. Prioritizes the highest-paying model in
// each locked category (most aspirational teaser).
export function getLockedTeasers(maxVram: number, count = 3): LockedTeaser[] {
  const teasers: LockedTeaser[] = [];
  for (const tpl of TASK_TEMPLATES) {
    const lockedModels = tpl.models.filter((m) => m.minVRAM > maxVram);
    if (lockedModels.length === 0) continue;
    // Pick the highest-VRAM locked model — usually the largest, most
    // attractive variant (Llama 405B over Llama 70B etc.)
    const top = lockedModels.reduce((best, m) =>
      m.minVRAM > best.minVRAM ? m : best
    );
    const avgSec = (tpl.minSec + tpl.maxSec) / 2;
    const avgReward = (tpl.minReward + tpl.maxReward) / 2;
    const dailyTasks = (86400 / avgSec) * QUEUE_SATURATION;
    const dailyPotentialUSD = Math.max(1, Math.round(dailyTasks * avgReward));
    teasers.push({
      category: tpl.category,
      type: TASK_CATEGORY_LABEL[tpl.category],
      model: top.name,
      minVRAM: top.minVRAM,
      rewardHint: `$${tpl.minReward.toFixed(3)}-$${tpl.maxReward.toFixed(2)}`,
      dailyPotentialUSD,
      unlockTier: unlockTierFor(top.minVRAM),
    });
  }
  // Sort by minVRAM ascending so the cheapest-to-unlock appears first.
  teasers.sort((a, b) => a.minVRAM - b.minVRAM);
  return teasers.slice(0, count);
}
