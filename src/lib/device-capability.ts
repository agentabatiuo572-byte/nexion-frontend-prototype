/**
 * Device capability measurement — the deterministic baseline behind a phone's
 * displayed "算力 (hashpower)".
 *
 * WHY THIS EXISTS (design intent):
 * The app never truly runs AI on the phone — the hashpower is a presented
 * number. The credibility risk is that a fabricated number could rank devices
 * implausibly (a budget phone showing MORE hashpower than a flagship). To make
 * the number trustworthy AND impossible to invert, the baseline is derived
 * DETERMINISTICALLY from real, cheap-to-read device signals that genuinely
 * correlate with device class. Three guarantees fall out of the construction:
 *
 *   1. MONOTONIC BY CONSTRUCTION — the score S is a positively-weighted sum of
 *      sub-scores that are each non-decreasing in "device goodness", and the
 *      score→TOPS map is strictly increasing. A strictly weaker device
 *      therefore cannot out-score / out-TOPS a strictly stronger one.
 *   2. FAIL-LOW — any signal we cannot read is imputed at a LOW value, never
 *      high. An unknown / spoofed-minimal / emulator device lands low and can
 *      never sit above a real flagship. (Also the anti-multi-account moat:
 *      cheap/headless farms read low specs → low yield.)
 *   3. DETERMINISTIC + CACHED PER deviceId — the same device always scores the
 *      same; recalibration reproduces the identical baseline (builds trust
 *      instead of looking random). A NEW device (new deviceId) recomputes from
 *      its own signals → naturally different → justifies recalibration.
 *
 * ⚠️ MOCK-ONLY: production may attest device class server-side; the client
 * still presents the same { score, tier, tops, baseRate* } shape.
 */

import { phoneTierYield } from "@/mock/phone-tiers";

export interface CapabilitySignals {
  /** RAM in GB (navigator.deviceMemory), or null if unreadable. */
  memGB: number | null;
  /** Logical CPU cores (navigator.hardwareConcurrency), or null. */
  cores: number | null;
  /** Device model string (from uni.getSystemInfoSync), or "". */
  model: string;
  /** Brand string, or "". */
  brand: string;
  /** GPU/renderer string (WebGL), or "". */
  gpu: string;
  /** Effective pixel density proxy = devicePixelRatio × min(screen dims). */
  pxDensity: number | null;
}

export interface DeviceCapability {
  /** 0–100 presented score (calibrated so a typical phone ≈ 87). */
  score: number;
  /** 1–5 capability tier. */
  tier: number;
  /** Presented NPU throughput in TOPS (realistic phone band ~8–58). */
  tops: number;
  /** Daily USDT baseline for this tier (small, within the safe display band). */
  baseRateUsdt: number;
  /** Daily NEX baseline for this tier. */
  baseRateNex: number;
  /** Raw signals used (for the calibration ritual's per-test rows). */
  signals: CapabilitySignals;
}

const BASELINE_KEY = "nexgrid-device-baseline-v1";

// Tier → daily yield is an OPERATOR-CONFIGURABLE business value, not an
// engineering constant: it lives in the backend-replaceable config
// mock/phone-tiers.ts (PROD: GET /api/config/phone-tiers, set in the ops
// console). Read it via phoneTierYield(tier) so the value has a single,
// swappable source.

// Legacy display anchor: a typical phone reads score 87 · 28.3 TOPS · Tier 3 · $0.06.
const TYPICAL_SCORE = 87;
const TYPICAL_TOPS = 28.3;

// ── monotonic normalisers (clamped 0..1; fail-low handled at call sites) ──
function normRange(v: number, lo: number, hi: number): number {
  if (hi <= lo) return 0;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

/** Model/brand → ordinal tier score 0..1. Unknown → conservative low-mid. */
function modelTierScore(model: string, brand: string): number {
  const s = `${brand} ${model}`.toLowerCase();
  if (/iphone\s*1[5-9]|iphone\s*2\d|pro\s*max|ultra|pixel\s*[89]|galaxy\s*s2[2-9]|sm-s9/.test(s)) return 0.95;
  if (/iphone\s*1[2-4]|pixel\s*[67]|galaxy\s*s2[01]|oneplus|mi\s*1[2-4]|redmi\s*k/.test(s)) return 0.75;
  if (/iphone\s*1[01]|iphone|pixel|galaxy|huawei|honor|oppo|vivo/.test(s)) return 0.55;
  // Desktop / dev browsers report no phone model — treat as capable mid-high so
  // the H5 prototype renders sensible numbers (not a budget-phone reading).
  if (/macintosh|windows|linux|mac\s*os|web/.test(s) || s.trim() === "") return 0.6;
  return 0.4; // unknown phone-ish → conservative low-mid (fail toward modest)
}

/** WebGL renderer → ordinal GPU tier 0..1. Unknown/masked → low. */
function gpuTierScore(gpu: string): number {
  const g = gpu.toLowerCase();
  if (!g) return 0.35; // masked / unavailable → fail-low
  if (/a1[5-9]\b|a2\d\b|adreno\s*7[3-9]|immortalis|rtx|radeon\s*r[x9]|apple\s*m[1-9]/.test(g)) return 0.95;
  if (/a1[1-4]\b|adreno\s*6[4-9]|mali-g7|apple\s*gpu/.test(g)) return 0.7;
  if (/adreno|mali|powervr|apple/.test(g)) return 0.5;
  return 0.4;
}

function readSignals(override?: Partial<CapabilitySignals>): CapabilitySignals {
  let model = "";
  let brand = "";
  try {
    const info = uni.getSystemInfoSync() as { model?: string; deviceModel?: string; brand?: string; platform?: string };
    model = info.model || info.deviceModel || info.platform || "";
    brand = info.brand || "";
  } catch {
    // ignore
  }

  let memGB: number | null = null;
  let cores: number | null = null;
  let pxDensity: number | null = null;
  let gpu = "";
  try {
    const nav = typeof navigator !== "undefined" ? (navigator as unknown as { deviceMemory?: number; hardwareConcurrency?: number }) : undefined;
    if (nav) {
      if (typeof nav.deviceMemory === "number") memGB = nav.deviceMemory;
      if (typeof nav.hardwareConcurrency === "number") cores = nav.hardwareConcurrency;
    }
  } catch {
    // ignore
  }
  try {
    if (typeof window !== "undefined" && window.screen) {
      const dpr = window.devicePixelRatio || 1;
      const minDim = Math.min(window.screen.width || 0, window.screen.height || 0);
      if (minDim > 0) pxDensity = dpr * minDim;
    }
  } catch {
    // ignore
  }
  try {
    gpu = readWebglRenderer();
  } catch {
    gpu = "";
  }

  const base: CapabilitySignals = { memGB, cores, model, brand, gpu, pxDensity };
  return override ? { ...base, ...override } : base;
}

function readWebglRenderer(): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  const gl = (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
  if (!gl) return "";
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  if (!dbg) return "";
  return String(gl.getParameter((dbg as { UNMASKED_RENDERER_WEBGL: number }).UNMASKED_RENDERER_WEBGL) || "");
}

/**
 * Compute the deterministic capability score (62–98) from signals. Pure +
 * monotonic: every sub-score is non-decreasing in "device goodness" and every
 * weight is positive, so a strictly weaker device cannot exceed a stronger one.
 * Unreadable signals are imputed LOW (fail-low) so unknown devices stay modest.
 */
export function scoreSignals(sig: CapabilitySignals): number {
  const memScore = normRange(sig.memGB ?? 2, 1, 12); // unknown → 2GB-ish (low)
  const cpuScore = normRange(sig.cores ?? 2, 2, 12); // unknown → 2 cores (low)
  const pxScore = normRange(sig.pxDensity ?? 600, 600, 1400); // unknown → low
  const modelScore = modelTierScore(sig.model, sig.brand);
  const gpuScore = gpuTierScore(sig.gpu);

  // Positive weights summing to 1 → S is a convex combo of monotonic terms.
  const S = 0.3 * modelScore + 0.25 * memScore + 0.2 * cpuScore + 0.15 * gpuScore + 0.1 * pxScore;

  // Map 0..1 → presented 62..98, calibrated so S≈0.7 → 87 (the typical phone).
  return Math.round(62 + S * 36);
}

function scoreToTier(score: number): number {
  if (score >= 94) return 5;
  if (score >= 89) return 4;
  if (score >= 82) return 3;
  if (score >= 74) return 2;
  return 1;
}

/** Increasing score→TOPS map, anchored at the typical phone (score 87 → 28.3
 *  TOPS). Slope ≈ 0.99 TOPS/point; strictly increasing within the realistic
 *  phone-NPU band [8, 58] and clamped (non-decreasing, ties only at the
 *  extremes) ⇒ never inverts capability ranking. */
function scoreToTops(score: number): number {
  const raw = TYPICAL_TOPS + 0.99 * (score - TYPICAL_SCORE);
  return +Math.max(8, Math.min(58, raw)).toFixed(1);
}

function buildCapability(sig: CapabilitySignals): DeviceCapability {
  const score = scoreSignals(sig);
  const tier = scoreToTier(score);
  const y = phoneTierYield(tier);
  return {
    score,
    tier,
    tops: scoreToTops(score),
    baseRateUsdt: y.baseRateUsdt,
    baseRateNex: y.baseRateNex,
    signals: sig,
  };
}

function readCache(): Record<string, DeviceCapability> {
  try {
    const c = uni.getStorageSync(BASELINE_KEY) as Record<string, DeviceCapability> | "";
    if (c && typeof c === "object") return c;
  } catch {
    // ignore
  }
  return {};
}

function writeCache(map: Record<string, DeviceCapability>): void {
  try {
    uni.setStorageSync(BASELINE_KEY, map);
  } catch {
    // ignore
  }
}

/** Cached baseline for a device, or null if never calibrated. */
export function getCachedCapability(deviceId: string): DeviceCapability | null {
  return readCache()[deviceId] ?? null;
}

/**
 * Measure (or replay) this device's capability baseline.
 * - Cache hit (and not forced) → returns the SAME baseline → recalibration is
 *   reproducible, not random.
 * - Cache miss → reads real signals, computes deterministically, caches.
 *
 * @param deviceId   the login device id (from device-id.ts)
 * @param opts.force recompute even if cached (still deterministic for same signals)
 * @param opts.overrideSignals DEV/QA-only — inject signals to demo a low-end vs
 *        flagship device and prove monotonicity without real hardware. Override
 *        results are NOT cached (they are hypothetical).
 */
export function measureDeviceCapability(
  deviceId: string,
  opts?: { force?: boolean; overrideSignals?: Partial<CapabilitySignals> },
): DeviceCapability {
  // DEV override: build from a low-defaulted synthetic base, never cache.
  if (opts?.overrideSignals) {
    const synthetic: CapabilitySignals = { memGB: null, cores: null, model: "", brand: "", gpu: "", pxDensity: null, ...opts.overrideSignals };
    return buildCapability(synthetic);
  }
  const cache = readCache();
  if (!opts?.force && cache[deviceId]) return cache[deviceId];
  const cap = buildCapability(readSignals());
  cache[deviceId] = cap;
  writeCache(cache);
  return cap;
}

/** The default baseline used when nothing is calibrated yet — the legacy demo
 *  phone (score 87 · 28.3 TOPS · Tier 3 · $0.06 · 10 NEX). Distinct from a
 *  fail-low *measured* device: this is the "no measurement event has run"
 *  placeholder, deliberately set to the historical typical phone. */
export function fallbackCapability(): DeviceCapability {
  const tier = scoreToTier(TYPICAL_SCORE);
  const y = phoneTierYield(tier);
  return {
    score: TYPICAL_SCORE,
    tier,
    tops: TYPICAL_TOPS,
    baseRateUsdt: y.baseRateUsdt,
    baseRateNex: y.baseRateNex,
    signals: { memGB: null, cores: null, model: "", brand: "", gpu: "", pxDensity: null },
  };
}
