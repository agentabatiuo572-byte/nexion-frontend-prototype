export interface HomeDisplayBatch {
  enabled: boolean;
  startAt: number;
  serverNow: number;
  validUntil: number;
  sequence: number;
  online: number[];
  paidCents: number[];
}

export function parseHomeDisplayBatch(value: unknown): HomeDisplayBatch {
  const v = value as HomeDisplayBatch;
  if (!v || typeof v.enabled !== "boolean" || !Number.isSafeInteger(v.startAt) || v.startAt <= 0
    || !Number.isSafeInteger(v.validUntil) || v.validUntil <= 0
    || !Number.isSafeInteger(v.serverNow) || v.serverNow <= 0 || !Number.isSafeInteger(v.sequence) || v.sequence < 0
    || !Array.isArray(v.online) || !Array.isArray(v.paidCents) || !v.online.length
    || v.online.length !== v.paidCents.length || v.online.length > 121
    || (v.enabled ? v.online.length < 61 : v.online.length !== 1)) throw new Error("HOME_DISPLAY_INVALID");
  for (const rows of [v.online, v.paidCents]) {
    if (rows.some((n, i) => !Number.isSafeInteger(n) || n < 0 || i > 0 && n < rows[i - 1]))
      throw new Error("HOME_DISPLAY_INVALID");
  }
  return v;
}

export function homeDisplayAt(batch: HomeDisplayBatch, serverNow: number) {
  if (!Number.isFinite(serverNow) || serverNow >= batch.validUntil) return null;
  const i = batch.enabled ? Math.max(0, Math.floor((serverNow - batch.startAt) / 1000)) : 0;
  if (i >= batch.online.length) return null;
  // The first second uses the next published sample; later seconds use the preceding one.
  const paidPerSec = !batch.enabled ? 0 : i === 0
    ? (batch.paidCents[1] - batch.paidCents[0]) / 100
    : (batch.paidCents[i] - batch.paidCents[i - 1]) / 100;
  return { online: batch.online[i], paid: batch.paidCents[i] / 100, paidPerSec };
}

/** One small visible-page clock; the only network operation is the minute refresh. */
export function createHomeDisplayPlayer(deps: {
  fetch(): Promise<HomeDisplayBatch>;
  now(): number;
  render(value: ReturnType<typeof homeDisplayAt>): void;
  onLoading?(loading: boolean): void;
}) {
  let lastClock = deps.now();
  let elapsed = 0;
  const now = () => {
    const current = deps.now();
    elapsed += Math.max(0, current - lastClock);
    lastClock = current;
    return elapsed;
  };
  let batch: HomeDisplayBatch | null = null;
  let offset = 0;
  let epoch = 0;
  let active = false;
  let pending = false;
  let nextFetch = 0;
  let timer: ReturnType<typeof setInterval> | undefined;
  const paint = () => deps.render(batch && now() + offset < batch.validUntil ? homeDisplayAt(batch, now() + offset) : null);
  async function refresh() {
    if (pending || !active) return;
    pending = true;
    deps.onLoading?.(true);
    const request = epoch;
    nextFetch = now() + 60_000;
    const started = now();
    try {
      const next = await deps.fetch();
      if (request !== epoch || !active) return;
      batch = next;
      offset = next.serverNow + Math.min(10_000, now() - started) / 2 - now();
      nextFetch = Math.min(nextFetch, next.validUntil - offset);
      paint();
    } catch {
      if (request === epoch && active) { batch = null; paint(); }
    } finally { if (request === epoch) { pending = false; deps.onLoading?.(false); } }
  }
  function tick() {
    paint();
    if (now() >= nextFetch) void refresh();
  }
  return {
    refresh,
    start() {
      if (active) return;
      active = true;
      epoch++;
      pending = false;
      if (batch) paint();
      void refresh();
      timer = setInterval(tick, 1000);
    },
    stop() {
      active = false;
      epoch++;
      pending = false;
      deps.onLoading?.(false);
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}
