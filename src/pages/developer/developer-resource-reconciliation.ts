export interface ReconciledApiKey { id: number; status: "ACTIVE" | "REVOKED"; }
export interface ReconciledWebhook {
  id: number;
  status: "ACTIVE" | "DISABLED" | "DELETED";
  deliveryEnabled: boolean;
}

/** A valid read is canonical even if it cannot prove the requested mutation succeeded. */
export async function readDeveloperResourceSnapshot<T>(
  list: () => Promise<T[]>,
  isCurrent: () => boolean,
  confirmed: (items: T[]) => boolean,
): Promise<{ items: T[]; confirmed: boolean } | null> {
  if (!isCurrent()) return null;
  try {
    const items = await list();
    return isCurrent() ? { items, confirmed: confirmed(items) } : null;
  } catch {
    return null;
  }
}

/** A failed revoke is known complete only when the authoritative list says REVOKED. */
export function isApiKeyRevoked(keys: ReconciledApiKey[], id: number): boolean {
  return keys.some((key) => key.id === id && key.status === "REVOKED");
}

/** A failed delete is known complete only when the authoritative list omits the record. */
export function isWebhookDeleted(webhooks: ReconciledWebhook[], id: number): boolean {
  return !webhooks.some((webhook) => webhook.id === id);
}

/** Do not infer enabled state from one field: server status and delivery flag must agree. */
export function isWebhookEnabled(webhooks: ReconciledWebhook[], id: number, enabled: boolean): boolean {
  return webhooks.some((webhook) => webhook.id === id
    && webhook.status === (enabled ? "ACTIVE" : "DISABLED")
    && webhook.deliveryEnabled === enabled);
}
