export interface P318AccountPageScope {
  accountKey: string;
  accountBindingEpoch: number;
  generation: number;
  lane: string;
  request: number;
}

/**
 * Keeps a page-local async result tied to the active account binding and to
 * the latest request in its own lane. `accountBindingEpoch` intentionally
 * catches same-key rebinds, which a key-only watcher cannot observe.
 */
export function createP318AccountPageFence(
  getAccountKey: () => string,
  getAccountBindingEpoch: () => number,
) {
  let generation = 0;
  const laneRequests = new Map<string, number>();

  return {
    capture(lane: string): P318AccountPageScope {
      const request = (laneRequests.get(lane) ?? 0) + 1;
      laneRequests.set(lane, request);
      return {
        accountKey: getAccountKey(),
        accountBindingEpoch: getAccountBindingEpoch(),
        generation,
        lane,
        request,
      };
    },
    invalidate(): void {
      generation += 1;
      laneRequests.clear();
    },
    isCurrent(scope: P318AccountPageScope): boolean {
      return scope.accountKey === getAccountKey()
        && scope.accountBindingEpoch === getAccountBindingEpoch()
        && scope.generation === generation
        && scope.request === laneRequests.get(scope.lane);
    },
  };
}
