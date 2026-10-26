import type { ThreadMsg } from './thread-types';

/** Resolve a flat RGBA paint before compositing; never a gradient within a bubble. */
function bubbleRgb(position: number, light: boolean): number[] {
  const t = Number.isFinite(position) ? Math.max(0, Math.min(1, position)) : 0.5;
  const top = light ? [130, 59, 191] : [95, 123, 12];
  const bottom = light ? [12.5, 66.75, 218.5] : [22, 88, 66];
  return top.map((value, index) => Math.round(value + (bottom[index] - value) * t));
}
export function bubbleFill(position: number, light: boolean): string {
  return `rgba(${bubbleRgb(position, light).join(', ')}, ${light ? 0.9 : 0.84})`;
}

export type ConversationRect = { top: number; left: number; width: number; height: number };
export type ReflectionBubble = ConversationRect & { outgoing: boolean; position: number };
/** Light belongs to the nearest bubble above/behind the upper rim, not a fixed theme glow. */
export function composerReflection(field: ConversationRect | undefined, bubbles: ReflectionBubble[]) {
  const off = { strength: 0, x: 50, width: 60, dark: 'transparent', light: 'transparent' };
  if (!field || ![field.top, field.left, field.width, field.height].every(Number.isFinite) || field.width <= 0) return off;
  let nearest: { bubble: ReflectionBubble; gap: number; left: number; right: number } | undefined;
  for (const bubble of bubbles) {
    if (![bubble.top, bubble.left, bubble.width, bubble.height].every(Number.isFinite) || bubble.width <= 0 || bubble.height <= 0 || bubble.top > field.top) continue;
    const left = Math.max(field.left, bubble.left), right = Math.min(field.left + field.width, bubble.left + bubble.width);
    const gap = Math.max(0, field.top - bubble.top - bubble.height);
    if (right <= left || gap >= 72 || (nearest && gap >= nearest.gap)) continue;
    nearest = { bubble, gap, left, right };
  }
  if (!nearest) return off;
  const { bubble, gap, left, right } = nearest, proximity = 1 - gap / 72;
  const strength = proximity * proximity * (3 - 2 * proximity);
  const rgb = (light: boolean) => {
    const base = bubble.outgoing ? bubbleRgb(bubble.position, light) : light ? [155, 166, 181] : [144, 156, 160];
    // The reflection lifts the same hue so it remains visible on dark glass.
    return base.map(channel => Math.round(channel + (255 - channel) * (light ? .06 : .22)));
  };
  return { strength: Math.round(strength * 1000) / 1000,
    x: Math.max(5, Math.min(95, ((left + right) / 2 - field.left) / field.width * 100)),
    width: Math.max(28, Math.min(92, (right - left) / field.width * 100)),
    dark: `rgba(${rgb(false).join(', ')}, .78)`, light: `rgba(${rgb(true).join(', ')}, .66)` };
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
