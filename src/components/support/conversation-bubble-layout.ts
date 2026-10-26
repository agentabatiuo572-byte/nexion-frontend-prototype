import type { ThreadMsg } from './thread-types';

/** One colour per bubble, sampled at its centre in the visible message viewport. */
export function bubbleViewportPosition(top: number, height: number, viewportTop: number, viewportHeight: number): number {
  if (![top, height, viewportTop, viewportHeight].every(Number.isFinite) || viewportHeight <= 0) return 0.5;
  return Math.round(Math.max(0, Math.min(1, (top + height / 2 - viewportTop) / viewportHeight)) * 1000) / 1000;
}

/** A change of speaker, system message, or time divider starts a new visual group. */
export function compactMessageGroups(messages: ThreadMsg[], dividers: Record<string, string>): Record<string, boolean> {
  return Object.fromEntries(messages.map((message, index) => {
    const previous = messages[index - 1];
    return [message.id, Boolean(previous && message.tone !== 'system' && previous.tone !== 'system'
      && message.side === previous.side && message.meta === previous.meta && !dividers[message.id])];
  }));
}
