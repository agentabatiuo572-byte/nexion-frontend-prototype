import { isCurrentRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";

export interface LearningPageFence {
  accountKey: string;
  accountEpoch: number;
  routeKey: string;
  runScope: RuntimeRevisionScope;
  generation: number;
}

export function createLearningPageFenceReader(
  getAccountKey: () => string,
  getAccountEpoch: () => number,
  getRunScope: () => RuntimeRevisionScope,
  getGeneration: () => number,
  isMounted: () => boolean,
  getRouteKey: () => string = () => "",
) {
  return {
    capture(): LearningPageFence {
      return {
        accountKey: getAccountKey(),
        accountEpoch: getAccountEpoch(),
        routeKey: getRouteKey(),
        runScope: getRunScope(),
        generation: getGeneration(),
      };
    },
    isCurrent(scope: LearningPageFence): boolean {
      return isMounted()
        && scope.accountKey === getAccountKey()
        && scope.accountEpoch === getAccountEpoch()
        && scope.routeKey === getRouteKey()
        && scope.generation === getGeneration()
        && isCurrentRuntimeRevision(scope.runScope);
    },
  };
}
