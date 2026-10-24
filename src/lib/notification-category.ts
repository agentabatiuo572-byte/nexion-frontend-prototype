export type NotificationCategory = "finance" | "device" | "team" | "rewards" | "system";
export function notificationCategory(notification: { kind: string; rawKind?: string }): NotificationCategory {
  const kind = (notification.rawKind ?? notification.kind).toLowerCase();
  if (["wallet", "payment_method", "withdrawal", "order", "commission", "staking", "market", "nova_commission", "nova_staking", "nova_market", "nova_staking_event", "nova_market_event"].includes(kind)) return "finance";
  if (["device", "dailysummary", "nova_dailysummary", "nova_upgrade", "nova_tradein"].includes(kind)) return "device";
  if (["team", "nova_team", "nova_team_event"].includes(kind)) return "team";
  if (["genesis", "nova_genesis", "reward", "nova_eventclaim", "nova_quest", "nova_tasklockmonthly"].includes(kind)) return "rewards";
  return "system";
}
