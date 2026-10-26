import { afterEach, expect, it, vi } from 'vitest';
import { conversationSendLimiter, createConversationSendBudgets, createSendLimiter } from './send-limiter';

afterEach(() => vi.useRealTimers());

it('rejects double taps and the sixth dispatch in a rolling window, including failed attempts', () => {
  const limiter = createSendLimiter(5, 15000, 1000);
  expect(limiter.tryAcquire(0).ok).toBe(true);
  expect(limiter.tryAcquire(999)).toEqual({ ok: false, retryInSec: 1 });
  for (const time of [1000, 2000, 3000, 4000]) expect(limiter.tryAcquire(time).ok).toBe(true);
  expect(limiter.tryAcquire(5000)).toEqual({ ok: false, retryInSec: 10 });
  expect(limiter.tryAcquire(14999).ok).toBe(false);
  expect(limiter.tryAcquire(15000).ok).toBe(true);
});

it('retains the budget across remounts and separates account and conversation owners', () => {
  vi.useFakeTimers(); vi.setSystemTime(100000);
  const budgets = createConversationSendBudgets();
  expect(budgets('a', 'thread').tryAcquire().ok).toBe(true);
  expect(budgets('a', 'thread').tryAcquire().ok).toBe(false);
  expect(budgets('b', 'thread').tryAcquire().ok).toBe(true);
  expect(budgets('a', 'different').tryAcquire().ok).toBe(true);
  vi.advanceTimersByTime(1000);
  expect(budgets('a', 'thread').tryAcquire().ok).toBe(true);
});

it('honors the later local/server deadline without shortening a server cooldown', () => {
  const limiter = createSendLimiter(5, 15000, 1000);
  limiter.tryAcquire(0); limiter.defer(30000, 100);
  limiter.defer(2000, 200);
  expect(limiter.tryAcquire(1000)).toEqual({ ok: false, retryInSec: 30 });
  expect(limiter.tryAcquire(30099).ok).toBe(false);
  expect(limiter.tryAcquire(30100).ok).toBe(true);
});

it('moves a t0 opening at 400ms without resetting the remaining 600ms gap', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  const opening = budgets('a', 'start:advisor');
  expect(opening.tryAcquire().ok).toBe(true);
  vi.setSystemTime(400);
  expect(budgets.transfer('a', 'start:advisor', 'CV-1')).toBe(opening);
  const reply = budgets('a', 'CV-1');
  expect(reply.remainingMs()).toBe(600);
  expect(reply.peek()).toEqual({ ok: false, retryInSec: 1 });
  expect(reply.tryAcquire(999).ok).toBe(false);
  expect(reply.tryAcquire(1000).ok).toBe(true);
  expect(reply.remainingMs(1400)).toBe(600);
});

it.each([1000, 1400])('does not restart a completed gap when moving at %ims', time => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  budgets('a', 'start:advisor').tryAcquire();
  vi.setSystemTime(time);
  budgets.transfer('a', 'start:advisor', 'CV-1');
  expect(budgets('a', 'CV-1').remainingMs()).toBe(0);
  expect(budgets('a', 'CV-1').tryAcquire().ok).toBe(true);
});

it('retires the start key so the next new conversation gets an independent budget', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  const opening = budgets('a', 'start:advisor');
  opening.tryAcquire(); opening.defer(30_000);
  vi.setSystemTime(400);
  budgets.transfer('a', 'start:advisor', 'CV-1');
  const next = budgets('a', 'start:advisor');
  expect(next).not.toBe(opening);
  expect(next.tryAcquire().ok).toBe(true);
  expect(budgets('a', 'CV-1').remainingMs()).toBe(29_600);
});

it('carries all five dispatch timestamps rather than starting a new window at transfer', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  const opening = budgets('a', 'start:advisor');
  for (const time of [0, 1000, 2000, 3000, 4000]) expect(opening.tryAcquire(time).ok).toBe(true);
  vi.setSystemTime(4400);
  budgets.transfer('a', 'start:advisor', 'CV-1');
  expect(budgets('a', 'CV-1').remainingMs()).toBe(10_600);
  expect(budgets('a', 'CV-1').tryAcquire(14_999).ok).toBe(false);
  expect(budgets('a', 'CV-1').tryAcquire(15_000).ok).toBe(true);
});

it('merges overfull histories and waits until fewer than five attempts remain', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  const opening = budgets('a', 'start:advisor'), target = budgets('a', 'CV-1');
  for (const time of [0, 2000, 4000]) expect(opening.tryAcquire(time).ok).toBe(true);
  for (const time of [1000, 3000, 5000]) expect(target.tryAcquire(time).ok).toBe(true);
  vi.setSystemTime(5400);
  expect(budgets.transfer('a', 'start:advisor', 'CV-1')).toBe(target);
  expect(target.remainingMs()).toBe(10_600);
  // At 15s only the oldest of six expires: five still occupy the window.
  expect(target.tryAcquire(15_000)).toEqual({ ok: false, retryInSec: 1 });
  expect(target.tryAcquire(15_999).ok).toBe(false);
  expect(target.tryAcquire(16_000).ok).toBe(true);
});

it('counts same-time attempts from separate buckets independently when merging', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  const opening = budgets('a', 'start:advisor'), target = budgets('a', 'CV-1');
  for (const time of [0, 1000, 2000]) opening.tryAcquire(time);
  for (const time of [0, 1000]) target.tryAcquire(time);
  vi.setSystemTime(3000);
  budgets.transfer('a', 'start:advisor', 'CV-1');
  expect(target.remainingMs()).toBe(12_000);
  expect(target.peek()).toEqual({ ok: false, retryInSec: 12 });
});

it.each([
  { sourceUntil: 30_000, targetUntil: 20_000 },
  { sourceUntil: 20_000, targetUntil: 30_000 },
])('preserves the later cooldown with source=$sourceUntil and target=$targetUntil', ({ sourceUntil, targetUntil }) => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  const opening = budgets('a', 'start:advisor'), target = budgets('a', 'CV-1');
  for (const time of [0, 2000, 4000]) opening.tryAcquire(time);
  for (const time of [1000, 3000, 5000]) target.tryAcquire(time);
  opening.defer(sourceUntil, 0); target.defer(targetUntil, 0);
  vi.setSystemTime(5400);
  budgets.transfer('a', 'start:advisor', 'CV-1');
  expect(target.remainingMs()).toBe(24_600);
  target.defer(1000); // A shorter later hint cannot replace the inherited deadline.
  expect(target.tryAcquire(29_999).ok).toBe(false);
  expect(target.tryAcquire(30_000).ok).toBe(true);
});

it('forwards held source references and late Retry-After hints through consecutive transfers', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  const opening = budgets('a', 'start:advisor'), target = budgets('a', 'CV-1'), next = budgets('a', 'CV-2');
  opening.tryAcquire(); target.tryAcquire();
  budgets.transfer('a', 'start:advisor', 'CV-1');
  budgets.transfer('a', 'CV-1', 'CV-2');
  opening.defer(7000, 100);
  expect(next.remainingMs(1000)).toBe(6100);
  expect(target.peek(1000)).toEqual(next.peek(1000));
  expect(opening.tryAcquire(7100).ok).toBe(true);
  expect(next.remainingMs(7100)).toBe(1000);
});

it('keeps transfers and server deadlines inside the specified account', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  budgets('a', 'start:advisor').defer(30_000);
  budgets('a', 'CV-1').defer(8000);
  budgets('b', 'start:advisor').defer(4000);
  budgets('b', 'CV-1').defer(6000);
  vi.setSystemTime(400);
  budgets.transfer('a', 'start:advisor', 'CV-1');
  expect(budgets('a', 'CV-1').remainingMs()).toBe(29_600);
  expect(budgets('a', 'start:advisor').remainingMs()).toBe(0);
  expect(budgets('b', 'CV-1').remainingMs()).toBe(5600);
  expect(budgets('b', 'start:advisor').remainingMs()).toBe(3600);
});

it('makes absent, repeated and same-key transfers harmless without double-counting', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  expect(budgets.transfer('a', 'missing', 'CV-1')).toBeUndefined();
  const opening = budgets('a', 'start:advisor', 2);
  opening.tryAcquire();
  expect(budgets.transfer('a', 'start:advisor', 'start:advisor')).toBe(opening);
  expect(budgets.transfer('a', 'start:advisor', 'CV-1')).toBe(opening);
  expect(budgets.transfer('a', 'start:advisor', 'CV-1')).toBe(opening);
  expect(opening.tryAcquire(1000).ok).toBe(true);
  expect(opening.tryAcquire(2000).ok).toBe(false);
});

it('keeps the stricter existing rules if two buckets were created with different policies', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  const opening = budgets('a', 'start:advisor', 2, 20_000, 2000);
  const target = budgets('a', 'CV-1', 5, 15_000, 1000);
  opening.tryAcquire(0); target.tryAcquire(1000);
  vi.setSystemTime(1200);
  budgets.transfer('a', 'start:advisor', 'CV-1');
  expect(target.remainingMs()).toBe(18_800);
  expect(target.tryAcquire(19_999).ok).toBe(false);
  expect(target.tryAcquire(20_000).ok).toBe(true);
  expect(target.remainingMs(20_001)).toBe(1999);
});

it('retains the last-dispatch gap even when its stamp has left a shorter window', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const budgets = createConversationSendBudgets();
  const opening = budgets('a', 'start:advisor', 5, 100, 1000);
  opening.tryAcquire();
  expect(opening.remainingMs(400)).toBe(600);
  vi.setSystemTime(400);
  budgets.transfer('a', 'start:advisor', 'CV-1');
  expect(budgets('a', 'CV-1').remainingMs()).toBe(600);
});

it('lets repeated tracking peeks observe gap, window and cooldown without consuming attempts', () => {
  const limiter = createSendLimiter(5, 15_000, 1000);
  limiter.tryAcquire(0);
  expect(limiter.peek(400)).toEqual({ ok: false, retryInSec: 1 });
  expect(limiter.remainingMs(400)).toBe(600);
  for (let i = 0; i < 20; i++) expect(limiter.peek(1000)).toEqual({ ok: true, retryInSec: 0 });
  for (const time of [1000, 2000, 3000, 4000]) expect(limiter.tryAcquire(time).ok).toBe(true);
  expect(limiter.peek(5000)).toEqual({ ok: false, retryInSec: 10 });
  limiter.defer(20_000, 5000);
  expect(limiter.peek(15_000)).toEqual({ ok: false, retryInSec: 10 });
  for (let i = 0; i < 20; i++) expect(limiter.peek(25_000).ok).toBe(true);
  expect(limiter.tryAcquire(25_000).ok).toBe(true);
  expect(limiter.remainingMs(25_000)).toBe(1000);
});

it('exposes transfer on the shared exported getter as well as factory instances', () => {
  vi.useFakeTimers(); vi.setSystemTime(0);
  const opening = conversationSendLimiter('transfer-interface-test', 'start:advisor');
  opening.tryAcquire();
  vi.setSystemTime(400);
  expect(conversationSendLimiter.transfer('transfer-interface-test', 'start:advisor', 'CV-1')).toBe(opening);
  expect(conversationSendLimiter('transfer-interface-test', 'CV-1').remainingMs()).toBe(600);
});
