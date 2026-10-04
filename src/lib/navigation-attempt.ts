export interface NavigationAttemptState {
  attempt: number;
  pendingUrl: string;
  hasError: boolean;
}

export function beginNavigationAttempt(
  state: NavigationAttemptState,
  url: string,
): NavigationAttemptState {
  return { attempt: state.attempt + 1, pendingUrl: url, hasError: false };
}

export function completeNavigationAttempt(
  state: NavigationAttemptState,
  attempt: number,
  outcome: "success" | "failure",
): NavigationAttemptState {
  if (attempt !== state.attempt) return state;
  return outcome === "success"
    ? { ...state, pendingUrl: "", hasError: false }
    : { ...state, hasError: true };
}
