import type { Messages } from "@/i18n/messages/en";
import type { TrialStatus } from "@/store/trial-boundary";

/** Presentation only: grace retains credit, but no longer represents an active trial. */
export function trialCardLabels(status: TrialStatus, copy: Messages["trial"]) {
  return status === "grace"
    ? { badge: copy.endedTitle, etaTemplate: copy.ghostGraceEta }
    : { badge: copy.ghostBadge, etaTemplate: copy.ghostEta };
}
