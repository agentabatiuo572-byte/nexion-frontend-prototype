// Sliding-window send limiter — client-side UX guard for chat inputs.
// Backend enforcement remains authoritative; this is the frontend dispatch
// budget and can also respect a server-provided Retry-After deadline.

export interface SendVerdict {
  ok: boolean;
  /** Seconds until the next send is allowed (0 when ok). */
  retryInSec: number;
}

export interface SendLimiter {
  /** Consume one attempted dispatch, including a retry or a rejected request. */
  tryAcquire(now?: number): SendVerdict;
  /** Query all gates without consuming a dispatch. */
  peek(now?: number): SendVerdict;
  remainingMs(now?: number): number;
  defer(delayMs: number, now?: number): void;
}

interface BudgetState {
  max: number;
  windowMs: number;
  minGapMs: number;
  stamps: number[];
  lastSentAt?: number;
  blockedUntil: number;
  forwardedTo?: BudgetState;
}

// Retained limiter references follow a transfer, including a late server defer.
const limiterStates = new WeakMap<SendLimiter, BudgetState>();
function currentState(state: BudgetState): BudgetState {
  if (state.forwardedTo) state.forwardedTo = currentState(state.forwardedTo);
  return state.forwardedTo ?? state;
}

function remainingMs(state: BudgetState, now: number): number {
  state.stamps = state.stamps.filter(t => now - t < state.windowMs);
  const gapWait = state.lastSentAt === undefined ? 0 : state.minGapMs - (now - state.lastSentAt);
  // A merge can leave more than max stamps. Wait until fewer than max remain.
  const windowWait = state.stamps.length >= state.max
    ? state.stamps[state.stamps.length - state.max] + state.windowMs - now : 0;
  return Math.max(0, gapWait, windowWait, state.blockedUntil - now);
}

function verdict(wait: number): SendVerdict {
  return { ok: wait <= 0, retryInSec: wait > 0 ? Math.max(1, Math.ceil(wait / 1000)) : 0 };
}

/** @param minGapMs Minimum gap between two consecutive sends (anti double-tap). */
export function createSendLimiter(max: number, windowMs: number, minGapMs = 0): SendLimiter {
  // Tracked separately from `stamps`: the window filter may evict the newest stamp
  // (when minGapMs > windowMs), which would silently disable the gap gate.
  const initial: BudgetState = { max, windowMs, minGapMs, stamps: [], blockedUntil: 0 };
  const limiter: SendLimiter = {
    defer(delayMs, now = Date.now()) {
      const state = currentState(initial);
      if (Number.isFinite(delayMs) && delayMs > 0) state.blockedUntil = Math.max(state.blockedUntil, now + delayMs);
    },
    remainingMs(now = Date.now()) {
      return remainingMs(currentState(initial), now);
    },
    peek(now = Date.now()) {
      return verdict(remainingMs(currentState(initial), now));
    },
    tryAcquire(now = Date.now()): SendVerdict {
      const state = currentState(initial);
      const result = verdict(remainingMs(state, now));
      if (result.ok) {
        state.stamps.push(now);
        state.lastSentAt = now;
      }
      return result;
    },
  };
  limiterStates.set(limiter, initial);
  return limiter;
}

function mergeBudgets(target: SendLimiter, source: SendLimiter): void {
  const into = currentState(limiterStates.get(target)!);
  const from = currentState(limiterStates.get(source)!);
  if (into === from) return;
  into.max = Math.min(into.max, from.max);
  into.windowMs = Math.max(into.windowMs, from.windowMs);
  into.minGapMs = Math.max(into.minGapMs, from.minGapMs);
  // Equal timestamps from separate buckets are distinct attempts, not duplicates.
  into.stamps = [...into.stamps, ...from.stamps].sort((a, b) => a - b);
  if (from.lastSentAt !== undefined) into.lastSentAt = Math.max(into.lastSentAt ?? from.lastSentAt, from.lastSentAt);
  into.blockedUntil = Math.max(into.blockedUntil, from.blockedUntil);
  from.forwardedTo = into;
}

export interface ConversationSendBudgets {
  (account: string, conversation: string, max?: number, windowMs?: number, minGapMs?: number): SendLimiter;
  /** Move within one account; merge an existing target and retire the source key. */
  transfer(account: string, from: string, to: string): SendLimiter | undefined;
}

/** Keep the same budget when a page remounts; accounts and conversations stay separate. */
export function createConversationSendBudgets(): ConversationSendBudgets {
  const conversationBudgets = new Map<string, { limiter: SendLimiter; touched: number }>();
  const keyFor = (account: string, conversation: string) => JSON.stringify([account, conversation]);
  const prune = (now: number) => {
    for (const [key, value] of conversationBudgets) if (now - value.touched > 30 * 86_400_000) conversationBudgets.delete(key);
  };
  const get = (account: string, conversation: string, max = 5, windowMs = 15_000, minGapMs = 1000): SendLimiter => {
    const now = Date.now();
    prune(now);
    const key = keyFor(account, conversation);
    let entry = conversationBudgets.get(key);
    if (!entry) { entry = { limiter: createSendLimiter(max, windowMs, minGapMs), touched: now }; conversationBudgets.set(key, entry); }
    entry.touched = now;
    return entry.limiter;
  };
  const transfer = (account: string, from: string, to: string): SendLimiter | undefined => {
    const now = Date.now();
    prune(now);
    const sourceKey = keyFor(account, from), targetKey = keyFor(account, to);
    const source = conversationBudgets.get(sourceKey), target = conversationBudgets.get(targetKey);
    if (sourceKey === targetKey || !source) {
      if (target) target.touched = now;
      return target?.limiter;
    }
    if (target) mergeBudgets(target.limiter, source.limiter);
    const moved = target ?? source;
    moved.touched = now;
    conversationBudgets.set(targetKey, moved);
    conversationBudgets.delete(sourceKey);
    return moved.limiter;
  };
  return Object.assign(get, { transfer });
}
export const conversationSendLimiter = createConversationSendBudgets();
