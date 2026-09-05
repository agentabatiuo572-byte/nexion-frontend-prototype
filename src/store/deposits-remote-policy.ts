export interface RemoteCreateState {
  railEnabled: boolean;
  intentListLoaded: boolean;
  pendingAmount: number | null;
}

export function normalizeRemoteDepositAmount(
  value: number,
  minimum: number,
  maximum: number,
): number | null {
  if (!Number.isFinite(value)) return null;
  const normalized = Number(value.toFixed(2));
  if (normalized < minimum || normalized > maximum) return null;
  return normalized;
}

export function mayIssueRemoteCreate(
  amount: number,
  state: RemoteCreateState,
): boolean {
  if (!state.railEnabled) return false;
  if (!state.intentListLoaded && state.pendingAmount === null) return false;
  return state.pendingAmount === null || state.pendingAmount === amount;
}

export function isCurrentRemoteBinding(
  capturedGeneration: number,
  currentGeneration: number,
): boolean {
  return capturedGeneration === currentGeneration;
}

export function isActionableRemoteIntentStatus(status: string): boolean {
  return status === "awaiting_payment";
}
