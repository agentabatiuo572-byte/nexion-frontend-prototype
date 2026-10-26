import { describe, expect, it } from 'vitest';
import { bubbleFill, bubbleViewportPosition, compactMessageGroups, composerReflection, type ReflectionBubble } from './conversation-bubble-layout';
import type { ThreadMsg } from './thread-types';

describe('composer reflection follows nearby conversation geometry', () => {
  const field = { top: 600, left: 64, width: 314, height: 56 };
  const bubble = (gap: number, extras: Partial<ReflectionBubble> = {}): ReflectionBubble => ({ top: 560 - gap, left: 180, width: 190, height: 40, outgoing: true, position: 1, ...extras });
  it('fades smoothly with distance and is fully absent beyond 72px', () => {
    const strengths = [0, 8, 36, 60, 72, 280].map(gap => composerReflection(field, [bubble(gap)]).strength);
    expect(strengths[0]).toBe(1); expect(strengths[1]).toBeGreaterThan(.95);
    expect(strengths[2]).toBe(.5); expect(strengths[3]).toBeLessThan(.1);
    expect(strengths.slice(4)).toEqual([0, 0]);
  });
  it('reflects the actual nearest hue and horizontal position, not a permanent theme stripe', () => {
    const reflected = composerReflection(field, [bubble(8)]);
    expect(reflected.dark).toBe('rgba(73, 125, 108, .78)');
    expect(reflected.light).toBe('rgba(28, 78, 221, .66)');
    expect(reflected.x).toBeGreaterThan(60);
    expect(reflected.width).toBeGreaterThan(50);
    expect(composerReflection(field, [bubble(8, { position: 0 })]).light).not.toBe(reflected.light);
  });
  it('chooses the nearby bubble over a distant bubble and uses neutral reflection for incoming', () => {
    const near = bubble(8, { outgoing: false, left: 12, width: 250 });
    expect(composerReflection(field, [bubble(60), near])).toEqual(composerReflection(field, [near]));
    expect(composerReflection(field, [near]).light).toBe('rgba(161, 171, 185, .66)');
  });
  it('keeps the rim lit while a bubble passes directly behind it', () => {
    expect(composerReflection(field, [bubble(-20)]).strength).toBe(1);
    expect(composerReflection(field, [bubble(-50)]).strength).toBe(0);
  });
  it('does not reflect a bubble with no horizontal overlap', () => {
    expect(composerReflection(field, [bubble(0, { left: 0, width: 40 })]).strength).toBe(0);
  });
  it.each([undefined, { ...field, width: 0 }, { ...field, top: NaN }])('clears stale reflection for an unavailable input measurement', invalid => {
    expect(composerReflection(invalid, [bubble(0)]).strength).toBe(0);
  });
  it('rejects invalid or missing bubble geometry', () => {
    expect(composerReflection(field, []).strength).toBe(0);
    expect(composerReflection(field, [bubble(0, { top: NaN }), bubble(0, { width: -1 })]).strength).toBe(0);
  });
  it('recalculates when multiline input grows towards a previously distant bubble', () => {
    const source = bubble(130);
    expect(composerReflection(field, [source]).strength).toBe(0);
    expect(composerReflection({ ...field, top: 480, height: 176 }, [source]).strength).toBeGreaterThan(.9);
  });
});

describe('bubble colour position in the visible viewport', () => {
  it('resolves one flat translucent paint per bubble with independent dark and light palettes', () => {
    expect([0, 0.5, 1].map(position => bubbleFill(position, false))).toEqual([
      'rgba(95, 123, 12, 0.84)', 'rgba(59, 106, 39, 0.84)', 'rgba(22, 88, 66, 0.84)',
    ]);
    expect([0, 0.5, 1].map(position => bubbleFill(position, true))).toEqual([
      'rgba(130, 59, 191, 0.9)', 'rgba(71, 63, 205, 0.9)', 'rgba(13, 67, 219, 0.9)',
    ]);
    expect(bubbleFill(NaN, true)).toBe(bubbleFill(0.5, true));
    expect(bubbleFill(-1, false)).toBe(bubbleFill(0, false));
    expect(bubbleFill(2, false)).toBe(bubbleFill(1, false));
  });
  it.each([
    ['top edge', 80, 40, 100, 400, 0],
    ['middle', 280, 40, 100, 400, 0.5],
    ['bottom edge', 480, 40, 100, 400, 1],
    ['above the viewport', -100, 40, 100, 400, 0],
    ['below the viewport', 600, 40, 100, 400, 1],
    ['partially visible tall bubble', 0, 400, 100, 400, 0.25],
    ['zero-height measurement', 300, 0, 100, 400, 0.5],
  ] as const)('samples the bubble centre at %s', (_label, top, height, viewportTop, viewportHeight, expected) => {
    expect(bubbleViewportPosition(top, height, viewportTop, viewportHeight)).toBe(expected);
  });

  it('uses the same coordinate space for the viewport and bubble, including a negative screen offset', () => {
    for (const offset of [-1000, 0, 1000]) {
      expect(bubbleViewportPosition(240 + offset, 80, 100 + offset, 600)).toBe(0.3);
    }
  });

  it('follows visible scroll position and viewport resize instead of a fixed message index', () => {
    expect(bubbleViewportPosition(200, 100, 100, 500)).toBe(0.3);
    expect(bubbleViewportPosition(100, 100, 100, 500)).toBe(0.1);
    expect(bubbleViewportPosition(200, 100, 100, 250)).toBe(0.6);
  });

  it('keeps consecutive positions ordered and returns bounded, stable fractional samples', () => {
    expect([-50, 50, 150, 250, 350].map(top => bubbleViewportPosition(top, 0, 0, 300)))
      .toEqual([0, 0.167, 0.5, 0.833, 1]);
  });

  it.each([0, -1, -400])('uses the neutral midpoint when viewport height is %s', viewportHeight => {
    expect(bubbleViewportPosition(100, 50, 20, viewportHeight)).toBe(0.5);
  });

  const invalidMeasurements = ['top', 'height', 'viewportTop', 'viewportHeight'].flatMap((field, index) =>
    [NaN, Infinity, -Infinity].map(value => ({ field, index, value })));
  it.each(invalidMeasurements)('uses the neutral midpoint for non-finite $field=$value', ({ index, value }) => {
    const rect: [number, number, number, number] = [200, 50, 100, 400]; rect[index] = value;
    expect(bubbleViewportPosition(...rect)).toBe(0.5);
  });
});

function message(id: string, overrides: Partial<ThreadMsg> = {}): ThreadMsg {
  return { id, side: 'left', tone: 'agent', text: `Message ${id}`, meta: 'Advisor A', ...overrides };
}

describe('compact message group boundaries', () => {
  it('handles an empty thread and never compacts the first message', () => {
    expect(compactMessageGroups([], {})).toEqual({});
    expect(compactMessageGroups([message('first')], {})).toEqual({ first: false });
  });

  it('compacts only consecutive messages from the same speaker on the same side', () => {
    const rows = [message('a1'), message('a2'), message('b1', { meta: 'Advisor B' }),
      message('a3'), message('u1', { side: 'right', tone: 'user', meta: 'You' }),
      message('u2', { side: 'right', tone: 'user', meta: 'You' }), message('a4')];
    expect(compactMessageGroups(rows, {})).toEqual({ a1: false, a2: true, b1: false, a3: false, u1: false, u2: true, a4: false });
  });

  it('keeps opposite sides separate even when their displayed author names match', () => {
    const rows = [message('in'), message('out', { side: 'right', tone: 'user' }), message('in-again')];
    expect(compactMessageGroups(rows, {})).toEqual({ in: false, out: false, 'in-again': false });
  });

  it.each(['left', 'right'] as const)('breaks both sides of a system notice even with an identical %s speaker label', side => {
    const sameSide = (id: string, system = false) => message(id, { side, tone: system ? 'system' : side === 'left' ? 'agent' : 'user' });
    const rows = [sameSide('before'), sameSide('notice', true), sameSide('notice2', true), sameSide('after'), sameSide('next')];
    expect(compactMessageGroups(rows, {})).toEqual({ before: false, notice: false, notice2: false, after: false, next: true });
  });

  it('starts a group at each time divider and lets the following same-speaker message continue it', () => {
    const rows = ['a', 'b', 'c', 'd', 'e'].map(id => message(id));
    expect(compactMessageGroups(rows, { a: 'Today', c: '18:57', e: 'Tomorrow' }))
      .toEqual({ a: false, b: true, c: false, d: true, e: false });
    expect(compactMessageGroups(rows, { unrelated: 'Yesterday' }))
      .toEqual({ a: false, b: true, c: true, d: true, e: true });
  });

  it('does not split a speaker group when a pending send is retried, acknowledged or replaced by a canonical id', () => {
    const first = message('sent', { side: 'right', tone: 'user', meta: 'You', deliveryState: 'sent' });
    const pending = message('local', { side: 'right', tone: 'user', meta: 'You', text: 'Another request', localSend: true });
    for (const deliveryState of ['sending', 'unknown', 'failed', 'sending', 'read'] as const) {
      expect(compactMessageGroups([first, { ...pending, deliveryState, imageSrc: 'private-image' }], {}))
        .toEqual({ sent: false, local: true });
    }
    expect(compactMessageGroups([first, { ...pending, id: 'canonical', localSend: false, deliveryState: 'sent' }], {}))
      .toEqual({ sent: false, canonical: true });
  });

  it('recomputes the first group after prepending history without mutating the input or retaining old output', () => {
    const current = [message('current'), message('next')], dividers = { current: 'Today' };
    current.forEach(Object.freeze); Object.freeze(current); Object.freeze(dividers);
    const before = compactMessageGroups(current, dividers);
    expect(before).toEqual({ current: false, next: true });
    expect(compactMessageGroups([message('older'), ...current], { older: 'Today' }))
      .toEqual({ older: false, current: true, next: true });
    expect(before).toEqual({ current: false, next: true });
    expect(dividers).toEqual({ current: 'Today' });
    expect(current.map(row => row.id)).toEqual(['current', 'next']);
  });
});
