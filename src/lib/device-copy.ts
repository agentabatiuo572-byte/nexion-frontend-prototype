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
import { nexGridBrandText } from "@/lib/brand-copy";

/** A linked computer carries the user's own GPU model → its stored strings are
 *  proper nouns. Without a tier match it holds the generic English spec.
 *  Takes the structural subset so callers holding a Device projection (e.g. the
 *  store's upgrade comparison) resolve the same label without a cast. */
type DeviceLabelSource = Pick<Device, "kind" | "name"> & Partial<Pick<Device, "gpuModel">>;

function isTieredPcGpu(d: DeviceLabelSource): boolean {
  return d.kind === "pc-gpu" && !!d.gpuModel;
}

export function deviceName(t: Messages, d: DeviceLabelSource): string {
  if (d.kind === "phone") return t.earn.yourPhone;
  if (d.kind === "pc-gpu") {
    return isTieredPcGpu(d) ? t.device.nameSharedComputer : t.device.nameComputerGpu;
  }
  return nexGridBrandText(d.name); // Persisted SKU names may use the previous brand.
}

/** Promo copy names a device by kind before one exists — no Device to pass. */
export function deviceNameByKind(t: Messages, kind: DeviceKind | null, stored: string): string {
  if (kind === null) return t.device.promoNoActive;
  if (kind === "phone") return t.earn.yourPhone;
  if (kind === "pc-gpu") return t.device.nameComputerGpu;
  return nexGridBrandText(stored); // Display only; protocol IDs stay unchanged.
}

/** Same, for a name dropped mid-sentence. The standalone names are label-cased
 *  ("Your phone"), which reads as a typo inside running copy — see
 *  home.doMathHeadline. SKU names are proper nouns: cased the same either way. */
export function deviceNameInline(t: Messages, kind: DeviceKind | null, stored: string): string {
  if (kind === null) return t.device.promoNoActive;
  if (kind === "phone") return t.device.namePhoneInline;
  if (kind === "pc-gpu") return t.device.nameComputerGpuInline;
  return nexGridBrandText(stored); // Display only.
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
  if (d.location === "User device") return t.device.locUserDevice;
  if (d.location === "Linked computer") return t.device.locLinkedComputer;
  // Translate a known place name, never infer a physical location from a SKU.
  if (d.location === "Frankfurt Data Center") return t.device.locFrankfurtDc;
  if (d.location === "Singapore Data Center") return t.device.locSingaporeDc;
  return d.location;
}
