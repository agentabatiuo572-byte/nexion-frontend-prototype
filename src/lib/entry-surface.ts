import { getCarrier } from "@/lib/carrier";

export type EntrySurface = "signed-app" | "h5" | "white-app";

export function getEntrySurface(): EntrySurface {
  // Legacy white-app values remain readable in session history only.
  return getCarrier() === "app" ? "signed-app" : "h5";
}

