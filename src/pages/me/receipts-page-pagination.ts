export interface RemoteComputePaginationState {
  initialLoading: boolean;
  moreLoading: boolean;
  nextOffset: number | null;
  nextCursor?: string | null;
}

/**
 * An offset-zero refresh replaces the list and cursor. Its old cursor must
 * never start a concurrent append request, or that append would supersede the
 * refresh and could concatenate stale rows.
 */
export function canLoadRemoteComputeMore(state: RemoteComputePaginationState): boolean {
  return !state.initialLoading && !state.moreLoading
    && ((state.nextCursor !== null && state.nextCursor !== undefined) || state.nextOffset !== null);
}
