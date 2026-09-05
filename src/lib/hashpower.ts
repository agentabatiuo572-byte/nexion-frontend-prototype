/**
 * Live effective hashpower derivation — single source for the phone card's
 * real-time "算力" number and curve.
 *
 *   online  (fresh heartbeat): effectiveTops = baselineTops × charge × network × thermal × continuity × jitter
 *   offline (no/stale beat):   effectiveTops = baselineTops × H5_BASE_FACTOR × network × jitter   (基础托管)
 *
 * SPEC-1 R7: the online tier is driven by the device's fresh resident-agent
 * heartbeat, never by the shell used to view it. A killed/offline device or an
 * H5-only session has no fresh beat and falls back to the hosted baseline.
 *
 * INVARIANT: every factor ∈ (0, 1], so the live value can never exceed the
 * device's own calibrated baseline ceiling. Combined with device-capability's
 * monotonic, globally-ordered baselines, this guarantees the displayed number
 * is always plausible (a budget phone's peak stays below a flagship's typical).
 *
 * The App factors are all things the user can see and act on (charge the phone,
 * stay online, keep it cool, stay connected on ONE device) — so the number feels
 * measured and earned. ContinuityFactor rewards keeping the app running on this
 * physical device and is reset on new-device recalibration.
 *
 * Pure & deterministic given inputs (jitter is a smooth function of nowSeed, not
 * Math.random) so the curve is stable across re-renders.
 */
import type { ThermalState } from "@/store/types";
import { DEFAULT_PLATFORM_CONFIG } from "@/mock/platform-config";

/** Continuous-online time at which the stability bonus reaches full — DEFAULT 2h,
 *  seeded from the 在线加成系数 config structure. The LIVE value flows in via the
 *  caller (computeLiveHashpower's input.onlineBonus / settleDevice's onlineBonus
 *  param, both read from the reactive config store) so a server-hydrated config
 *  takes effect with zero consumer rewrite; this const is the fallback default. */
export const CONTINUITY_FULL_MS = DEFAULT_PLATFORM_CONFIG.onlineBonus.continuityFullHours * 60 * 60 * 1000;
const CONTINUITY_FLOOR = 0.85; // fresh session / just-switched device starts here

/** Hosted-baseline factor (legacy config key: h5BaseFactor): any phone without a
 *  fresh device heartbeat earns this fraction of its ceiling, including H5-only,
 *  killed-App and offline devices (charge/thermal/continuity are not measurable).
 *  DEFAULT seeded from the config; the LIVE value flows via the caller's
 *  onlineBonus (read from the config store) — backend-replaceable, this is the fallback. */
export const H5_BASE_FACTOR = DEFAULT_PLATFORM_CONFIG.onlineBonus.h5BaseFactor;

/** Mock timeout for the resident device-agent heartbeat. PROD replaces this
 * timestamp test with the server-canonical conclusion produced from candidate
 * `POST /api/device/:id/heartbeat` (PRD §6.11/§12.2). */
export const ONLINE_HEARTBEAT_TIMEOUT_MS = 3 * 60 * 1000;

/** Single online seam for both earnings and display. Phone truth comes from the
 * resident-agent heartbeat; hosted hardware keeps its service-managed status.
 * The view carrier must never be consulted here: the same device has the same
 * result from App and H5. */
export function isDeviceOnline(
  device: {
    kind?: string;
    status?: "online" | "offline";
    onlineHeartbeatAt?: number | null;
  },
  now: number,
  timeoutMs: number = ONLINE_HEARTBEAT_TIMEOUT_MS,
): boolean {
  if (device.kind != null && device.kind !== "phone") return device.status === "online";
  if (device.kind === "phone" && device.status != null && device.status !== "online") return false;
  return device.onlineHeartbeatAt != null && now >= device.onlineHeartbeatAt && now - device.onlineHeartbeatAt < timeoutMs;
}

export type HashFactorKey = "offline" | "battery" | "thermal" | "continuity" | "peak";

export interface HashFactors {
  charge: number;
  network: number;
  thermal: number;
  continuity: number;
  jitter: number;
}

export interface LiveHashpower {
  /** Live effective TOPS (≤ baselineTops). */
  effectiveTops: number;
  /** Current output as a % of the device's own ceiling (≤ 100). */
  effectivePct: number;
  factors: HashFactors;
  /** Which factor currently dominates the reading — drives the positive label. */
  dominant: HashFactorKey;
}

export function thermalFactor(state: ThermalState | undefined): number {
  switch (state) {
    case "fair":
      return 0.92;
    case "serious":
      return 0.8;
    case "critical":
      return 0.6;
    default:
      return 1; // nominal / undefined
  }
}

/** Continuity ramps CONTINUITY_FLOOR → 1.0 over fullMs (defaults to the seed const). */
export function continuityFactor(continuityMs: number, fullMs: number = CONTINUITY_FULL_MS): number {
  const p = Math.max(0, Math.min(1, continuityMs / fullMs));
  return +(CONTINUITY_FLOOR + (1 - CONTINUITY_FLOOR) * p).toFixed(4);
}

/** Smooth ≤1 jitter from two out-of-phase sines → an "alive" curve that only
 *  ever dips below the ceiling (range ≈ [0.955, 1.0]). */
function smoothJitter(nowSeed: number): number {
  const a = 0.5 + 0.5 * Math.sin(nowSeed / 2100);
  const b = 0.5 + 0.5 * Math.sin(nowSeed / 900 + 1.3);
  return +(1 - 0.03 * a - 0.015 * b).toFixed(4);
}

export interface LiveHashInput {
  baselineTops: number;
  /** R7: fresh device heartbeat → full factors; otherwise hosted baseline. */
  online: boolean;
  isCharging: boolean;
  isOnline: boolean;
  thermalState?: ThermalState;
  /** ms the phone has been continuously mining (since miningSince); 0 if idle. */
  continuityMs: number;
  /** time seed for jitter (epoch ms). */
  nowSeed: number;
  /** SPEC-1 在线加成系数 (live, from the config store — backend-replaceable);
   *  falls back to the seed-derived consts when omitted. */
  onlineBonus?: { h5BaseFactor: number; continuityFullHours: number };
}

export function computeLiveHashpower(input: LiveHashInput): LiveHashpower {
  const jitter = smoothJitter(input.nowSeed);
  const network = input.isOnline ? 1 : 0;
  // SPEC-1: live 在线加成系数 from the caller (config store); default = seed const.
  const h5Base = input.onlineBonus?.h5BaseFactor ?? H5_BASE_FACTOR;
  const continuityFullMs = input.onlineBonus
    ? input.onlineBonus.continuityFullHours * 60 * 60 * 1000
    : CONTINUITY_FULL_MS;

  // ── Device offline / stale heartbeat: hosted baseline ──
  if (!input.online) {
    const effectiveTops = +(input.baselineTops * h5Base * network * jitter).toFixed(1);
    const effectivePct = input.baselineTops > 0 ? Math.round((effectiveTops / input.baselineTops) * 100) : 0;
    const factors: HashFactors = { charge: h5Base, network, thermal: 1, continuity: 1, jitter };
    return { effectiveTops, effectivePct, factors, dominant: network === 0 ? "offline" : "peak" };
  }

  // ── Device truly online: full live factors ──
  const charge = input.isCharging ? 1 : 0.6;
  const thermal = thermalFactor(input.thermalState);
  const continuity = continuityFactor(input.continuityMs, continuityFullMs);

  const factors: HashFactors = { charge, network, thermal, continuity, jitter };
  const effectiveTops = +(input.baselineTops * charge * network * thermal * continuity * jitter).toFixed(1);
  const effectivePct = input.baselineTops > 0 ? Math.round((effectiveTops / input.baselineTops) * 100) : 0;

  let dominant: HashFactorKey;
  if (network === 0) dominant = "offline";
  else if (charge < 1) dominant = "battery";
  else if (thermal < 1) dominant = "thermal";
  else if (continuity < 0.999) dominant = "continuity";
  else dominant = "peak";

  return { effectiveTops, effectivePct, factors, dominant };
}
