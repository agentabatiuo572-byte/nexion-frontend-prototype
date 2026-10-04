import { isCurrentQuest } from "@/lib/actionable-quest";
import type { CanonicalQuest } from "@/api/quest-api";

export type QuickFact = { state: "loading" } | { state: "error" } | { state: "ready"; value: number };

export function quickNumericFact(remote: boolean, state: string, value: number): QuickFact {
  if (!remote || state === "ready") return { state: "ready", value };
  return { state: state === "error" || state === "unavailable" ? "error" : "loading" };
}

export function quickMissionFact(remote: boolean, state: string, rows: readonly CanonicalQuest[], now: number): QuickFact {
  return quickNumericFact(remote, state, rows.filter(row => isCurrentQuest(row, now)).length);
}
