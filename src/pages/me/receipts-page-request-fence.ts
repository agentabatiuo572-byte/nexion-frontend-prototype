export interface ReceiptsPageRequestScope {
  accountKey: string;
  accountBindingEpoch: number;
  pageEpoch: number;
  lane: string;
  request: number;
}

/**
 * A UniApp page can be hidden by navigateTo without being unmounted. Keep each
 * receipt read tied to that visible page instance, its account binding and its
 * own request lane so a late promise cannot update the covered page.
 */
export function createReceiptsPageRequestFence(
  getAccountKey: () => string,
  getAccountBindingEpoch: () => number,
) {
  let visible = false;
  let pageEpoch = 0;
  const laneRequests = new Map<string, number>();

  function invalidate(): void {
    pageEpoch += 1;
    laneRequests.clear();
  }

  return {
    show(): void {
      visible = true;
      invalidate();
    },
    hide(): void {
      visible = false;
      invalidate();
    },
    isVisible(): boolean {
      return visible;
    },
    invalidate,
    capture(lane: string): ReceiptsPageRequestScope {
      const request = (laneRequests.get(lane) ?? 0) + 1;
      laneRequests.set(lane, request);
      return {
        accountKey: getAccountKey(),
        accountBindingEpoch: getAccountBindingEpoch(),
        pageEpoch,
        lane,
        request,
      };
    },
    isCurrent(scope: ReceiptsPageRequestScope): boolean {
      return visible
        && scope.accountKey === getAccountKey()
        && scope.accountBindingEpoch === getAccountBindingEpoch()
        && scope.pageEpoch === pageEpoch
        && scope.request === laneRequests.get(scope.lane);
    },
  };
}
