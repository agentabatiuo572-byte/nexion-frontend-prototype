// Proof-of-Compute receipt generator (design doc §6.9).
// Each completed AI task → one receipt with mock cryptographic dressing
// (signature, tx_hash, GPU fingerprint). All hex values are random — there
// is no real on-chain footprint or verifiable signature.
// Historical verification records can still be read, but no new ones are generated.

import type { CompletedTask, Device, TaskCategory } from "../store/types";
import { getClientById, AI_CLIENTS } from "./ai-clients";

// "KY" is retained only as an opaque historical category code.
export type ReceiptCategory = TaskCategory | "KY";

export interface Receipt {
  id: string;
  category: ReceiptCategory;
  type: string;               // human label, e.g. "Image Gen" or "Withdrawal"
  model: string;

  // Client (signer / authority)
  client: string;
  clientAddress: string;      // 0x… mock EVM-style

  // Cryptographic dressing (all mock)
  signature: string;          // 64 hex
  txHash: string;             // 64 hex
  blockNumber: number;

  // Device that ran the task
  deviceName: string;
  deviceGpu: string;
  deviceFingerprint: string;  // 16 hex

  // Runtime metrics
  durationSec: number;
  vramPeakGb: number;
  vramTotalGb: number;
  energyKwh: number;

  // Pricing
  unitPriceLabel: string;     // e.g. "$0.0030 / image" or "$1.00 / verification"
  unitsLabel: string;         // e.g. "8 images" or "1 wallet"
  gross: number;              // USDT
  fee: number;
  netPaid: number;            // USDT

  // Timing
  settledAt: number;          // epoch ms
  completedAt: number;        // epoch ms

  // Per-category extras
  details?: ReceiptDetails;

  // Historical verification fields are read-only.
  verificationChecks?: string[];
  verificationNetwork?: string;
  verificationWalletAddress?: string;
}

export type ReceiptDetails =
  | { kind: "IG"; resolution: string; batchSize: number; outputCount: number }
  | { kind: "VG"; resolution: string; durationSec: number; fps: number; frames: number }
  | { kind: "LL"; modelSize: string; inputTokens: number; outputTokens: number; latencyP50ms: number; latencyP95ms: number }
  | { kind: "FT"; trainingSteps: number; finalLoss: number; lossCurve: number[] }
  | { kind: "EM"; chunksCount: number; totalTokens: number; embeddingDim: 1536 | 3072 }
  | { kind: "SP"; audioDurationSec: number; wer: number; languageDetected: string };

// ───── Helpers ─────

function randomHex(length: number): string {
  const chars = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < length; i++) s += chars[Math.floor(Math.random() * 16)];
  return s;
}

function pickFromHash(hash: string, n = 8): string {
  return hash.slice(0, n);
}

// Fingerprint a device with a stable-ish hex derived from id + GPU. Two
// receipts from the same device should share fingerprint, so we hash by
// using `${id}-${gpu}` as seed via a tiny djb2 → hex.
function fingerprintFor(id: string, gpu: string): string {
  let h = 5381;
  const s = `${id}-${gpu}`;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  // Expand to 16 hex by mixing with a second pass
  let h2 = h;
  for (let i = 0; i < s.length; i++) h2 = ((h2 * 33) ^ s.charCodeAt(i)) >>> 0;
  return (h.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 16);
}

// ───── Per-category detail synthesizers ─────

function buildIGDetails(): Extract<ReceiptDetails, { kind: "IG" }> {
  const resolutions = ["1024×1024", "1024×1024", "896×1152", "1280×768"];
  const batch = [4, 6, 8, 8, 12, 16][Math.floor(Math.random() * 6)];
  return {
    kind: "IG",
    resolution: resolutions[Math.floor(Math.random() * resolutions.length)],
    batchSize: batch,
    outputCount: batch,
  };
}

function buildVGDetails(durationSec: number): Extract<ReceiptDetails, { kind: "VG" }> {
  const resolutions = ["1080p", "1080p", "4K", "720p"];
  const fps = [24, 24, 30, 30, 60][Math.floor(Math.random() * 5)];
  const clipSec = +(2 + Math.random() * 10).toFixed(1); // visible clip length
  return {
    kind: "VG",
    resolution: resolutions[Math.floor(Math.random() * resolutions.length)],
    durationSec: clipSec,
    fps,
    frames: Math.round(clipSec * fps),
  };
}

function buildLLDetails(model: string): Extract<ReceiptDetails, { kind: "LL" }> {
  // Infer model size from model name.
  const sizeMatch = model.match(/(\d+B)/);
  const modelSize = sizeMatch ? sizeMatch[1] : (model.includes("22B") ? "8×22B" : "—");
  const inputTokens = 200 + Math.floor(Math.random() * 8000);
  const outputTokens = 50 + Math.floor(Math.random() * 4000);
  const latencyP50ms = 80 + Math.floor(Math.random() * 220);
  return {
    kind: "LL",
    modelSize,
    inputTokens,
    outputTokens,
    latencyP50ms,
    latencyP95ms: latencyP50ms + 80 + Math.floor(Math.random() * 220),
  };
}

function buildFTDetails(): Extract<ReceiptDetails, { kind: "FT" }> {
  const steps = [200, 300, 500, 800][Math.floor(Math.random() * 4)];
  // mini loss curve, monotonically decreasing-ish (8 points 0..1)
  const curve: number[] = [];
  let v = 1.6 + Math.random() * 0.8;
  for (let i = 0; i < 8; i++) {
    v = Math.max(0.18, v - 0.08 - Math.random() * 0.08);
    curve.push(+v.toFixed(3));
  }
  return { kind: "FT", trainingSteps: steps, finalLoss: curve[curve.length - 1], lossCurve: curve };
}

function buildEMDetails(): Extract<ReceiptDetails, { kind: "EM" }> {
  const chunks = 200 + Math.floor(Math.random() * 18000);
  return {
    kind: "EM",
    chunksCount: chunks,
    totalTokens: chunks * (180 + Math.floor(Math.random() * 220)),
    embeddingDim: Math.random() < 0.6 ? 1536 : 3072,
  };
}

function buildSPDetails(): Extract<ReceiptDetails, { kind: "SP" }> {
  const langs = ["en-US", "en-GB", "ja-JP", "ko-KR", "zh-CN", "es-ES", "de-DE"];
  return {
    kind: "SP",
    audioDurationSec: 30 + Math.floor(Math.random() * 1800),
    wer: +(0.018 + Math.random() * 0.048).toFixed(3),
    languageDetected: langs[Math.floor(Math.random() * langs.length)],
  };
}

function buildDetails(category: TaskCategory, model: string, durationSec: number): ReceiptDetails {
  switch (category) {
    case "IG": return buildIGDetails();
    case "VG": return buildVGDetails(durationSec);
    case "LL": return buildLLDetails(model);
    case "FT": return buildFTDetails();
    case "EM": return buildEMDetails();
    case "SP": return buildSPDetails();
  }
}

// Per-category unit price label + units label, derived from details.
// Matches §7.1 table (per 1k tokens / per image / per audio sec etc.)
function unitPricing(
  category: TaskCategory,
  details: ReceiptDetails,
  gross: number
): { unitPriceLabel: string; unitsLabel: string } {
  switch (details.kind) {
    case "IG": {
      const unit = gross / Math.max(1, details.outputCount);
      return {
        unitPriceLabel: `$${unit.toFixed(4)} / image`,
        unitsLabel: `${details.outputCount} images`,
      };
    }
    case "VG": {
      const unit = gross / Math.max(1, details.durationSec);
      return {
        unitPriceLabel: `$${unit.toFixed(3)} / sec`,
        unitsLabel: `${details.durationSec}s @ ${details.resolution}`,
      };
    }
    case "LL": {
      const tokens = details.inputTokens + details.outputTokens;
      const unitPer1k = (gross / Math.max(1, tokens)) * 1000;
      return {
        unitPriceLabel: `$${unitPer1k.toFixed(4)} / 1k tok`,
        unitsLabel: `${(tokens / 1000).toFixed(1)}k tokens`,
      };
    }
    case "FT": {
      return {
        unitPriceLabel: `$${gross.toFixed(3)} / job`,
        unitsLabel: `${details.trainingSteps} steps`,
      };
    }
    case "EM": {
      const unit = (gross / Math.max(1, details.chunksCount)) * 1000;
      return {
        unitPriceLabel: `$${unit.toFixed(4)} / 1k chunks`,
        unitsLabel: `${details.chunksCount.toLocaleString()} chunks`,
      };
    }
    case "SP": {
      const unit = gross / Math.max(1, details.audioDurationSec);
      return {
        unitPriceLabel: `$${unit.toFixed(4)} / audio sec`,
        unitsLabel: `${(details.audioDurationSec / 60).toFixed(1)} min`,
      };
    }
  }
  // Fallback (unreachable due to exhaustive switch above, but TS needs it)
  return { unitPriceLabel: `$${gross.toFixed(3)}`, unitsLabel: "1 job" };
}

// Resolve client address from roster by name (used during receipt build).
function clientAddressFor(clientName: string): string {
  const found = AI_CLIENTS.find((c) => c.name === clientName);
  return found?.address ?? "0x0000000000000000000000000000000000000000";
}

// ───── Main entry ─────

export function generateReceipt(task: CompletedTask, device: Device): Receipt {
  const details = buildDetails(task.category, task.model, task.totalSec);
  const fee = +Math.max(0.0001, task.reward * 0.033).toFixed(4);
  const netPaid = +(task.reward - fee).toFixed(4);
  const { unitPriceLabel, unitsLabel } = unitPricing(task.category, details, task.reward);

  // Energy roughly = power * duration / 3600 / 1000 (kWh).
  // Use an arbitrary "device draw" estimate (basePower approximation).
  const energyKwh = +(0.04 + Math.random() * 0.18).toFixed(3);

  const _ = getClientById; // (silence unused-import lint if tree-shaken)
  return {
    id: task.id,
    category: task.category,
    type: task.type,
    model: task.model,
    client: task.client,
    clientAddress: clientAddressFor(task.client),
    signature: "0x" + randomHex(64),
    txHash: "0x" + randomHex(64),
    blockNumber: 18_700_000 + Math.floor(Math.random() * 50_000),
    deviceName: device.name,
    deviceGpu: device.gpu,
    deviceFingerprint: fingerprintFor(device.id, device.gpu),
    durationSec: task.totalSec,
    vramPeakGb:
      device.vramTotal > 0
        ? +(device.vramTotal * (0.55 + Math.random() * 0.4)).toFixed(1)
        : 0,
    vramTotalGb: device.vramTotal,
    energyKwh,
    unitPriceLabel,
    unitsLabel,
    gross: +task.reward.toFixed(4),
    fee,
    netPaid,
    settledAt: task.completedAt,
    completedAt: task.completedAt,
    details,
  };
}

// Truncate hex with middle ellipsis: 0x4f7a...e21a
export function shortenHex(s: string, head = 6, tail = 4): string {
  if (s.length <= head + tail + 2) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
}

// Used by `unitPricing` short helper if called from UI directly.
export { pickFromHash };
