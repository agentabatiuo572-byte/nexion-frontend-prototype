// FEAT-DEV01 等效换皮 P0 gate — the task-capacity band table must reproduce the
// retired hardware-degradation curve EXACTLY (narrative swap, zero economic
// change; 主人拍板 2026-07-06). Text-parses the literals out of
// src/store/device-lifecycle.ts (no TS import — same approach as the admin
// repo's canon-sentinel), rebuilds the curve from the parsed bands, and diffs
// it against the legacy constants (-4%/-6%/-23.7%/month, floor 0.22) at
// 0.25-month steps over months 0..24.
//
// Also structure-checks the FEAT-DEV02 credit-ladder literal in
// src/mock/tradein-config.ts: contiguous coverage from 0% to an open-ended top
// band, strictly decreasing creditPct, bounds in (0,100].
//
// ⚠️ When the product INTENTIONALLY re-tunes the schedule, update the GOLDEN
// constants below + the admin repo's canon-numbers.json in the same change —
// this gate exists to catch silent drift, not to freeze product decisions.
// Optional argv[2] = root override (negative-probe / CI).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SELF_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] || join(SELF_DIR, "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");

const errs = [];

// ── GOLDEN: the retired degradation curve (device-lifecycle.ts pre-refactor) ──
const GOLDEN = { early: -0.04, middle: -0.06, late: -0.237, floor: 0.22 };
function goldenRateAt(m) {
  if (m <= 3) return GOLDEN.early;
  if (m <= 8) return GOLDEN.middle;
  return GOLDEN.late;
}
function goldenEff(monthsOwned) {
  if (monthsOwned <= 0) return 1;
  const whole = Math.floor(monthsOwned);
  const frac = monthsOwned - whole;
  let eff = 1;
  for (let m = 1; m <= whole; m++) eff *= 1 + goldenRateAt(m);
  if (frac > 0) eff *= 1 + goldenRateAt(whole + 1) * frac;
  return Math.max(GOLDEN.floor, eff);
}

// ── Parse the live literals ──
const src = read("src/store/device-lifecycle.ts");

const bandRe = /\{\s*throughMonth:\s*(\d+|null)\s*,\s*monthlyDeltaPct:\s*(-?\d+(?:\.\d+)?)\s*\}/g;
const bands = [...src.matchAll(bandRe)].map((m) => ({
  through: m[1] === "null" ? null : Number(m[1]),
  delta: Number(m[2]),
}));
if (bands.length === 0) errs.push("TASK_CAPACITY_BANDS literal not found / not regex-extractable (canon depends on this shape)");
if (bands.length && bands[bands.length - 1].through !== null) errs.push("last capacity band must be open-ended (throughMonth: null)");

const floorM = src.match(/CAPACITY_FLOOR\s*=\s*(\d+(?:\.\d+)?)/);
const floor = floorM ? Number(floorM[1]) : NaN;
if (!floorM) errs.push("CAPACITY_FLOOR literal not found");

const exemptM = src.match(/CAPACITY_EXEMPT_KINDS[^=]*=\s*\[([^\]]*)\]/);
const exempt = exemptM ? exemptM[1] : "";
for (const kind of ["phone", "cloud-share", "pc-gpu"]) {
  if (!exempt.includes(`"${kind}"`)) errs.push(`CAPACITY_EXEMPT_KINDS missing "${kind}" (主人拍板: 免递减范围维持现状)`);
}

const subsidyM = src.match(/SUBSIDY_DAYS\s*=\s*(\d+)/);
if (!subsidyM) errs.push("SUBSIDY_DAYS literal not found");

function liveRateAt(m) {
  for (const b of bands) {
    if (b.through === null || m <= b.through) return b.delta / 100;
  }
  return bands.length ? bands[bands.length - 1].delta / 100 : 0;
}
function liveEff(monthsOwned) {
  if (monthsOwned <= 0) return 1;
  const whole = Math.floor(monthsOwned);
  const frac = monthsOwned - whole;
  let eff = 1;
  for (let m = 1; m <= whole; m++) eff *= 1 + liveRateAt(m);
  if (frac > 0) eff *= 1 + liveRateAt(whole + 1) * frac;
  return Math.max(floor, eff);
}

// ── Curve parity: 0..24 months at 0.25-month steps ──
let samples = 0;
if (!errs.length) {
  for (let m = 0; m <= 24; m += 0.25) {
    samples += 1;
    const g = goldenEff(m);
    const l = liveEff(m);
    if (Math.abs(g - l) > 1e-9) {
      errs.push(`capacity(${m}mo) drifted: golden ${g} vs live ${l} (等效换皮 P0 broken)`);
      if (errs.length > 6) break;
    }
  }
  if (Math.abs(liveEff(13) - GOLDEN.floor) > 1e-9) {
    errs.push(`floor breach: capacity(13mo)=${liveEff(13)} expected ${GOLDEN.floor}`);
  }
}

// ── FEAT-DEV02 credit-ladder structure ──
const tc = read("src/mock/tradein-config.ts");
const rowRe = /\{\s*minRatioPct:\s*(\d+(?:\.\d+)?)\s*,\s*maxRatioPct:\s*(\d+(?:\.\d+)?|null)\s*,\s*creditPct:\s*(\d+(?:\.\d+)?)\s*\}/g;
const rows = [...tc.matchAll(rowRe)].map((m) => ({
  min: Number(m[1]),
  max: m[2] === "null" ? null : Number(m[2]),
  credit: Number(m[3]),
}));
if (rows.length < 2) {
  errs.push("TRADEIN_CREDIT_LADDER literal not found / fewer than 2 rows");
} else {
  if (rows[0].min !== 0) errs.push(`ladder must start at 0% (got ${rows[0].min})`);
  if (rows[rows.length - 1].max !== null) errs.push("ladder top band must be open-ended (maxRatioPct: null)");
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (r.credit <= 0 || r.credit > 100) errs.push(`ladder row ${i + 1} creditPct ${r.credit} out of (0,100]`);
    if (i > 0) {
      if (rows[i - 1].max !== r.min) errs.push(`ladder gap/overlap: row ${i} max ${rows[i - 1].max} ≠ row ${i + 1} min ${r.min}`);
      if (r.credit >= rows[i - 1].credit) errs.push(`ladder creditPct not strictly decreasing at row ${i + 1} (${rows[i - 1].credit} → ${r.credit})`);
    }
  }
}

if (errs.length) {
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  `capacity-curve parity: ${samples} samples diff<1e-9 · floor ${floor} · exempt 3 kinds · subsidy ${subsidyM[1]}d display-only · credit ladder ${rows.length} rows valid`,
);
