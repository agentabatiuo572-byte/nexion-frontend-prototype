export interface ExchangeToastScopeState {
  mounted: boolean;
  accountScopeCurrent: boolean;
  runScopeCurrent: boolean;
}

/** UI feedback is safe only while the request still belongs to this page and scope. */
export function canShowExchangeToast(state: ExchangeToastScopeState): boolean {
  return state.mounted && state.accountScopeCurrent && state.runScopeCurrent;
}
