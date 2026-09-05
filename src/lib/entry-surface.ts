import { getCarrier } from "@/lib/carrier";

export type EntrySurface = "signed-app" | "h5" | "white-app";

function readEntryParam(): string {
  // #ifdef H5
  try {
    const hash = window.location.hash || "";
    const search = window.location.search || "";
    const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?")) : "";
    const params = new URLSearchParams(`${search}${hashQuery ? `&${hashQuery.slice(1)}` : ""}`);
    return (params.get("entry") || params.get("surface") || "").trim().toLowerCase();
  } catch {
    return "";
  }
  // #endif
  return "";
}

export function getEntrySurface(): EntrySurface {
  const carrier = getCarrier();
  if (carrier === "app") return "signed-app";

  const entry = readEntryParam();
  if (entry === "white-app" || entry === "white" || entry === "cloak" || entry === "janus") {
    return "white-app";
  }
  return "h5";
}

