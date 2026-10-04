export function selectHomeQuestRows<T>(
  remoteEnabled: boolean,
  remoteReady: boolean,
  remoteRows: readonly T[],
  mockRows: readonly T[],
): T[] {
  if (!remoteEnabled) return [...mockRows];
  return remoteReady ? [...remoteRows] : [];
}
