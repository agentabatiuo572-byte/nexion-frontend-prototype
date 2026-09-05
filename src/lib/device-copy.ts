// Display strings for a Device (name / GPU line / location).
//
// Same rule as lib/workload-label.ts: the Device record stores English, because
// a real backend would return it and the mock keeps the shape
// backend-replaceable — but devices are persisted per account, so rendering the
// stored string freezes whatever language the device was created in. Resolve
// from the stable `kind` at render time instead.
//
// Only descriptive strings resolve. SKU names (NexGridBox S1, NexGridRack P1,
// Cloud Share — all sold under those names in the store) and hardware models
// (4× RTX 4090, 8× NVIDIA A100, the user's own "RTX 4070 · 240 TOPS") are brand
// marks and proper nouns: they stay as stored in every locale, matching how
// lib/product-copy.ts leaves Product.name alone.
//
// Anything we cannot resolve falls back to the stored English rather than
// rendering blank — a new DeviceKind degrades, it does not break the card.

import type { Messages } from "@/i18n/messages/en";
import type { Device, DeviceKind } from "@/store/types";
import { fmt } from "@/i18n/format";

/** A linked computer carries the user's own GPU model → its stored strings are
 *  proper nouns. Without a tier match it holds the generic English spec. */
function isTieredPcGpu(d: Device): boolean {
  return d.kind === "pc-gpu" && !!d.gpuModel;
}

export function deviceName(t: Messages, d: Device): string {
  if (d.kind === "phone") return t.earn.yourPhone;
  if (d.kind === "pc-gpu") {
    return isTieredPcGpu(d) ? t.device.nameSharedComputer : t.device.nameComputerGpu;
  }
  return d.name; // SKU / brand mark
}

/** Promo copy names a device by kind before one exists — no Device to pass. */
export function deviceNameByKind(t: Messages, kind: DeviceKind | null, stored: string): string {
  if (kind === null) return t.device.promoNoActive;
  if (kind === "phone") return t.earn.yourPhone;
  if (kind === "pc-gpu") return t.device.nameComputerGpu;
  return stored; // SKU / brand mark
}

/** Same, for a name dropped mid-sentence. The standalone names are label-cased
 *  ("Your phone"), which reads as a typo inside running copy — see
 *  home.doMathHeadline. SKU names are proper nouns: cased the same either way. */
export function deviceNameInline(t: Messages, kind: DeviceKind | null, stored: string): string {
  if (kind === null) return t.device.promoNoActive;
  if (kind === "phone") return t.device.namePhoneInline;
  if (kind === "pc-gpu") return t.device.nameComputerGpuInline;
  return stored; // SKU / brand mark
}

export function deviceGpuLabel(t: Messages, d: Device): string {
  if (d.kind === "phone") {
    // Phones built before capabilityTops existed keep their stored spec rather
    // than rendering a blank TOPS figure.
    return d.capabilityTops == null
      ? d.gpu
      : fmt(t.device.gpuMobileNpu, { tops: d.capabilityTops });
  }
  if (d.kind === "pc-gpu") {
    return isTieredPcGpu(d) ? d.gpu : t.device.gpuComputerShared;
  }
  if (d.kind === "cloud-share") return t.device.gpuDistributed;
  return d.gpu; // hardware model
}

/** Empty string when the device has no location (phone / cloud share), matching
 *  the stored `location?: string` the card already treats as optional. */
export function deviceLocation(t: Messages, d: Device): string {
  if (!d.location) return "";
  if (d.kind === "pc-gpu") return t.device.locLinkedComputer;
  if (d.kind.startsWith("stellarrack")) return t.device.locFrankfurtDc;
  if (d.kind.startsWith("stellarbox")) return t.device.locSingaporeDc;
  return d.location;
}
