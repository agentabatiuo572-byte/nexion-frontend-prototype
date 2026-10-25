import type { Notification } from "@/store/notifications";

export type NotificationCategory = "finance" | "device" | "team" | "rewards" | "system";

/** Display groups are independent of the six persisted notification preferences. */
export function notificationCategory(notification: Pick<Notification, "kind" | "rawKind">): NotificationCategory {
  const kind = (notification.rawKind ?? notification.kind).toLowerCase();
  switch (kind) {
    case "wallet": case "payment_method": case "withdrawal": case "order":
    case "commission": case "staking": case "nova_commission":
      return "finance";
    case "device": case "dailysummary": case "nova_dailysummary":
    case "nova_upgrade": case "nova_tradein":
      return "device";
    case "team": case "nova_team": case "nova_team_event":
      return "team";
    case "marketing": case "market": case "nova_market": case "nova_staking": case "nova_staking_event": case "nova_market_event":
    case "genesis": case "nova_genesis": case "reward": case "nova_eventclaim": case "nova_quest": case "nova_tasklockmonthly":
      return "rewards";
    default:
      return "system";
  }
}

/** Keep existing preference keys; only documented/observed aliases are normalized. */
export function notificationPreferenceKind(value: string): Notification["kind"] {
  const kind = value.trim().toLowerCase();
  if (["marketing", "market", "nova_market", "nova_market_event"].includes(kind)) return "market";
  if (["commission", "team", "staking", "genesis", "system"].includes(kind)) return kind as Notification["kind"];
  return "system";
}
