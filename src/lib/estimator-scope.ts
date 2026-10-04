export interface EstimatorScope {
  accountKey: string;
  accountEpoch: number;
  generation: number;
}

export function createEstimatorScope(accountKey: string, accountEpoch: number, generation: number): EstimatorScope {
  return { accountKey, accountEpoch, generation };
}

export function isCurrentEstimatorScope(request: EstimatorScope, current: EstimatorScope): boolean {
  return request.accountKey === current.accountKey
    && request.accountEpoch === current.accountEpoch
    && request.generation === current.generation;
}
