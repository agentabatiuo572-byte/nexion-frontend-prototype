export interface AmbassadorAgentFence {
  accountKey: string;
  generation: number;
}

export interface CurrentAmbassadorAgentFence extends AmbassadorAgentFence {
  mounted: boolean;
}

/**
 * A page request is authoritative only while its authenticated account and
 * page generation still match. This is deliberately pure so every late
 * response branch can use the same proof before touching UI or commands.
 */
export function isCurrentAmbassadorAgentFence(
  request: AmbassadorAgentFence,
  current: CurrentAmbassadorAgentFence,
): boolean {
  return current.mounted
    && request.generation === current.generation
    && request.accountKey === current.accountKey;
}
