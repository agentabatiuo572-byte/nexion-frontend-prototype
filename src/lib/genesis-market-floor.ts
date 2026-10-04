/**
 * A production market must only display a floor that the canonical public
 * state supplied. The editable mock rail retains its local G4 seed.
 */
export function genesisMarketFloor(
  remoteEnabled: boolean,
  remoteFloor: number | null,
  mockFloor: number,
): number | null {
  return remoteEnabled ? remoteFloor : mockFloor;
}
