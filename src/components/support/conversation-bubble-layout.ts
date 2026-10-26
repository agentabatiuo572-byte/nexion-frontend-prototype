import type { ThreadMsg } from './thread-types';

/** Resolve a flat RGBA paint before compositing; never a gradient within a bubble. */
export function bubbleFill(position: number, light: boolean): string {
  const t = Number.isFinite(position) ? Math.max(0, Math.min(1, position)) : 0.5;
  const top = light ? [130, 59, 191] : [95, 123, 12];
  const bottom = light ? [12.5, 66.75, 218.5] : [22, 88, 66];
  const rgb = top.map((value, index) => Math.round(value + (bottom[index] - value) * t));
  return `rgba(${rgb.join(', ')}, ${light ? 0.9 : 0.84})`;
}

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
