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
  const i = batch.enabled ? Math.max(0, Math.floor((serverNow - batch.startAt) / 1000)) : 0;
  if (i >= batch.online.length) return null;
  return { online: batch.online[i], paid: batch.paidCents[i] / 100 };
}

/** One small visible-page clock; the only network operation is the minute refresh. */
export function createHomeDisplayPlayer(deps: {
  fetch(): Promise<HomeDisplayBatch>;
  now(): number;
  render(value: { online: number; paid: number } | null): void;
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
    } finally { if (request === epoch) pending = false; }
  }
  function tick() {
    paint();
    if (now() >= nextFetch) void refresh();
  }
  return {
    start() {
      if (active) return;
      active = true;
      epoch++;
      pending = false;
      void refresh();
      timer = setInterval(tick, 1000);
    },
    stop() {
      active = false;
      epoch++;
      pending = false;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    },
  };
}
