// Display label for an AI workload (plus the legacy "KY" verification pseudo-workload
// kept only so historical receipts still render after the legacy identity flow was removed).
//
// The data layer bakes an English `type` string — store/types.ts
// TASK_CATEGORY_LABEL feeds CurrentTask.type / LockedTeaser.type / Receipt.type
// — because a real backend would return one, and the mock keeps the shape
// backend-replaceable. The UI must not render it: receipts are persisted, so a
// baked label would freeze whatever language the job happened to run in, and
// switching locale would leave old rows stranded in English.
//
// Resolve from the stable `category` code at render time instead. Model, client
// and device names stay untranslated — they are proper nouns.

import type { Messages } from "@/i18n/messages/en";
import type { TaskCategory } from "@/store/types";

// TaskCategory plus the legacy "KY" pseudo-category persisted receipts may carry
// (mirrors ReceiptCategory in mock/receipt.ts; spelled out so lib/ stays free of a
// mock/ import).
export type LabelCategory = TaskCategory | "KY";

export function workloadLabel(t: Messages, category: LabelCategory): string {
  return category === "KY"
    ? t.receipt.typeWalletPairing
    : t.market.workloads[category].label;
}
