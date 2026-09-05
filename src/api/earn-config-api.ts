import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export type TaskClass = "IG" | "VG" | "LL" | "FT" | "EM" | "SP";

export interface EarnTaskClass {
  taskId: string;
  taskClass: TaskClass;
  taskName: string;
  models: string[];
  minReward: number;
  maxReward: number;
  minVRAM: number;
  enabled: boolean;
  avgSec: number;
  dailyPotential: number;
}

export interface EarnTeaser {
  deviceClass: "cloud-share" | "phone" | "S1" | "Pro" | "Rack";
  vram: number;
  lockedTasks: string[];
  dailyPotential: number;
}

export interface EarnTaskPricing {
  taskClasses: EarnTaskClass[];
  queueSaturation: number;
  teaser: EarnTeaser[];
  effectiveAt: string;
  sources: string[];
}

export interface EarnPhoneTier {
  tier: number;
  name: string;
  baseRateUsdt: number;
  baseRateNex: number;
  effectiveAt: string;
}

export interface EarnPhoneTiers {
  tiers: EarnPhoneTier[];
  sources: string[];
}

export interface EarnTaskRoute {
  routable: boolean;
  deviceVramGb: number;
  selectedTask: EarnTaskClass | null;
  eligibleTaskClasses: TaskClass[];
  queueSaturation: number;
  effectiveAt: string;
  sources: string[];
}

export interface EarnConfigApi {
  taskPricing(): Promise<EarnTaskPricing>;
  phoneTiers(): Promise<EarnPhoneTiers>;
  route(deviceVramGb: number): Promise<EarnTaskRoute>;
}

const TASK_CLASSES = new Set<TaskClass>(["IG", "VG", "LL", "FT", "EM", "SP"]);
const DEVICE_CLASSES = new Set<EarnTeaser["deviceClass"]>(["cloud-share", "phone", "S1", "Pro", "Rack"]);

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function number(value: unknown, min = 0): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= min ? parsed : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value.map(text);
  return values.every((item): item is string => item !== null) ? values : null;
}

function parseTaskClass(value: unknown, errorMessage: string): EarnTaskClass {
  const row = record(value);
  const taskId = text(row?.taskId);
  const taskClass = text(row?.taskClass);
  const taskName = text(row?.taskName);
  const models = stringArray(row?.models);
  const minReward = number(row?.minReward);
  const maxReward = number(row?.maxReward);
  const minVRAM = number(row?.minVRAM);
  const avgSec = number(row?.avgSec, Number.EPSILON);
  const dailyPotential = number(row?.dailyPotential);
  if (
    !row || !taskId || !taskClass || !TASK_CLASSES.has(taskClass as TaskClass) || !taskName
    || !models || minReward === null || maxReward === null || minReward > maxReward
    || minVRAM === null || !Number.isInteger(minVRAM) || typeof row.enabled !== "boolean"
    || avgSec === null || dailyPotential === null
  ) {
    throw new ApiError({ kind: "protocol", message: errorMessage });
  }
  return { taskId, taskClass: taskClass as TaskClass, taskName, models, minReward, maxReward,
    minVRAM, enabled: row.enabled, avgSec, dailyPotential };
}

export function parseEarnTaskPricing(value: unknown): EarnTaskPricing {
  const source = record(value);
  if (!source) {
    throw new ApiError({ kind: "protocol", message: "E2_TASK_PRICING_RESPONSE_INVALID" });
  }
  const rawClasses = Array.isArray(source.taskClasses) ? source.taskClasses : null;
  const rawTeaser = Array.isArray(source.teaser) ? source.teaser : null;
  const queueSaturation = number(source.queueSaturation);
  const effectiveAt = text(source.effectiveAt);
  const sources = stringArray(source.sources);
  if (!rawClasses || !rawTeaser || queueSaturation === null || queueSaturation > 1 || !effectiveAt || !sources) {
    throw new ApiError({ kind: "protocol", message: "E2_TASK_PRICING_RESPONSE_INVALID" });
  }
  const taskClasses = rawClasses.map((raw) => parseTaskClass(raw, "E2_TASK_PRICING_RESPONSE_INVALID"));
  if (taskClasses.length !== 6 || new Set(taskClasses.map((row) => row.taskClass)).size !== 6) {
    throw new ApiError({ kind: "protocol", message: "E2_TASK_PRICING_RESPONSE_INVALID" });
  }
  const teaser = rawTeaser.map((raw): EarnTeaser => {
    const row = record(raw);
    const deviceClass = text(row?.deviceClass);
    const vram = number(row?.vram);
    const lockedTasks = stringArray(row?.lockedTasks);
    const dailyPotential = number(row?.dailyPotential);
    if (
      !row || !deviceClass || !DEVICE_CLASSES.has(deviceClass as EarnTeaser["deviceClass"])
      || vram === null || !Number.isInteger(vram) || !lockedTasks || dailyPotential === null
    ) {
      throw new ApiError({ kind: "protocol", message: "E2_TASK_PRICING_RESPONSE_INVALID" });
    }
    return { deviceClass: deviceClass as EarnTeaser["deviceClass"], vram, lockedTasks, dailyPotential };
  });
  return { taskClasses, queueSaturation, teaser, effectiveAt, sources };
}

export function parseEarnPhoneTiers(value: unknown): EarnPhoneTiers {
  const source = record(value);
  if (!source) {
    throw new ApiError({ kind: "protocol", message: "E2_PHONE_TIERS_RESPONSE_INVALID" });
  }
  const rawTiers = Array.isArray(source.tiers) ? source.tiers : null;
  const sources = stringArray(source.sources);
  if (!rawTiers || !sources) {
    throw new ApiError({ kind: "protocol", message: "E2_PHONE_TIERS_RESPONSE_INVALID" });
  }
  const tiers = rawTiers.map((raw): EarnPhoneTier => {
    const row = record(raw);
    const tier = number(row?.tier, 1);
    const name = text(row?.name);
    const baseRateUsdt = number(row?.baseRateUsdt, Number.EPSILON);
    const baseRateNex = number(row?.baseRateNex, Number.EPSILON);
    const effectiveAt = text(row?.effectiveAt);
    if (
      !row || tier === null || !Number.isInteger(tier) || tier > 5 || !name
      || baseRateUsdt === null || baseRateNex === null || !effectiveAt
    ) {
      throw new ApiError({ kind: "protocol", message: "E2_PHONE_TIERS_RESPONSE_INVALID" });
    }
    return { tier, name, baseRateUsdt, baseRateNex, effectiveAt };
  }).sort((left, right) => left.tier - right.tier);
  if (
    tiers.length !== 5
    || tiers.some((row, index) => row.tier !== index + 1)
    || tiers.some((row, index) => index > 0 && (
      row.baseRateUsdt < tiers[index - 1].baseRateUsdt
      || row.baseRateNex < tiers[index - 1].baseRateNex
    ))
  ) {
    throw new ApiError({ kind: "protocol", message: "E2_PHONE_TIERS_RESPONSE_INVALID" });
  }
  return { tiers, sources };
}

export function parseEarnTaskRoute(value: unknown): EarnTaskRoute {
  const source = record(value);
  const deviceVramGb = number(source?.deviceVramGb);
  const queueSaturation = number(source?.queueSaturation);
  const effectiveAt = text(source?.effectiveAt);
  const sources = stringArray(source?.sources);
  const rawEligible = source?.eligibleTaskClasses;
  const eligibleRaw = Array.isArray(rawEligible) ? rawEligible : null;
  if (!source || typeof source.routable !== "boolean" || deviceVramGb === null
      || !Number.isInteger(deviceVramGb) || queueSaturation === null || queueSaturation > 1
      || !effectiveAt || !sources || !eligibleRaw) {
    throw new ApiError({ kind: "protocol", message: "E2_TASK_ROUTE_RESPONSE_INVALID" });
  }
  const eligibleTaskClasses = eligibleRaw.map(text);
  if (!eligibleTaskClasses.every((item): item is TaskClass => !!item && TASK_CLASSES.has(item as TaskClass))) {
    throw new ApiError({ kind: "protocol", message: "E2_TASK_ROUTE_RESPONSE_INVALID" });
  }
  let selectedTask: EarnTaskClass | null = null;
  if (source.selectedTask != null) {
    selectedTask = parseTaskClass(source.selectedTask, "E2_TASK_ROUTE_RESPONSE_INVALID");
  }
  if (new Set(eligibleTaskClasses).size !== eligibleTaskClasses.length
      || source.routable !== (selectedTask !== null)
      || (selectedTask !== null && (!selectedTask.enabled || selectedTask.minVRAM > deviceVramGb
        || !eligibleTaskClasses.includes(selectedTask.taskClass)))) {
    throw new ApiError({ kind: "protocol", message: "E2_TASK_ROUTE_RESPONSE_INVALID" });
  }
  return { routable: Boolean(source.routable), deviceVramGb, selectedTask, eligibleTaskClasses, queueSaturation, effectiveAt, sources };
}

export function createEarnConfigApi(client: ApiClient): EarnConfigApi {
  return {
    taskPricing: async () => parseEarnTaskPricing(await client.request({
      method: "GET",
      path: "/api/config/task-pricing",
      authenticated: false,
    })),
    phoneTiers: async () => parseEarnPhoneTiers(await client.request({
      method: "GET",
      path: "/api/config/phone-tiers",
      authenticated: false,
    })),
    route: async (deviceVramGb) => {
      if (!Number.isSafeInteger(deviceVramGb) || deviceVramGb < 0) {
        throw new ApiError({ kind: "configuration", message: "DEVICE_VRAM_INVALID" });
      }
      return parseEarnTaskRoute(await client.request({
        method: "GET",
        path: `/api/tasks/route?deviceVramGb=${deviceVramGb}`,
      }));
    },
  };
}
