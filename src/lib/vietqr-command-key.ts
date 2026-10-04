export interface VietQrCommandIdentity {
  accountKey: string;
  action: "CREATE" | "CANCEL";
  fingerprint: string;
}

interface PendingVietQrCommand extends VietQrCommandIdentity {
  key: string;
  intentNo?: string;
}

interface VietQrCommandState {
  schema: 2;
  clientNonce: string;
  pending: Record<string, PendingVietQrCommand>;
  generations: Record<string, number>;
}

export interface VietQrCommandStorage {
  read(): unknown;
  write(value: VietQrCommandState): void;
}

const STORAGE_KEY = "nexgrid-vietqr-command-keys-v1";
const CLIENT_NONCE_PATTERN = /^[a-z0-9_-]{8,128}$/i;
const COMMAND_KEY_PATTERN = /^[a-z0-9._:-]{1,128}$/i;
const MAX_GENERATION = 1_000_000;

function defaultClientNonce(): string {
  try {
    const cryptoApi = globalThis.crypto;
    if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
      const values = new Uint32Array(4);
      cryptoApi.getRandomValues(values);
      // A few embedded WebViews expose a stub that fills every word with the
      // same constant. Treat that degenerate output as unavailable entropy so
      // reinstalling or clearing storage cannot reproduce one fixed nonce.
      if (values.some((value) => value !== values[0])) {
        return Array.from(values, (value) => value.toString(36).padStart(7, "0")).join("-");
      }
    }
  } catch {
    // Some embedded WebViews expose crypto but reject getRandomValues. The
    // fallback still mixes wall-clock time with two independent random draws.
  }
  const timestamp = Date.now().toString(36).padStart(9, "0");
  const randomA = Math.random().toString(36).slice(2, 12).padEnd(10, "0");
  const randomB = Math.random().toString(36).slice(2, 12).padEnd(10, "0");
  return `${timestamp}-${randomA}-${randomB}`;
}

function freshClientNonce(createClientNonce: () => string): string {
  try {
    const candidate = createClientNonce().trim();
    if (CLIENT_NONCE_PATTERN.test(candidate)) return candidate;
  } catch {
    // Fall through to the production generator when an injected WebView API
    // or test factory cannot provide a valid installation identifier.
  }
  return defaultClientNonce();
}

const empty = (clientNonce: string): VietQrCommandState => ({
  schema: 2,
  clientNonce,
  pending: {},
  generations: {},
});

function identityScope(identity: VietQrCommandIdentity): string {
  const accountKey = identity.accountKey.trim().toLowerCase();
  const fingerprint = identity.fingerprint.trim();
  if (!accountKey || !fingerprint || (identity.action !== "CREATE" && identity.action !== "CANCEL")) {
    throw new Error("VIETQR_COMMAND_IDENTITY_INVALID");
  }
  return JSON.stringify([accountKey, identity.action, fingerprint]);
}

function parse(value: unknown, createClientNonce: () => string): VietQrCommandState {
  const source = value && typeof value === "object"
    ? value as {
        schema?: number;
        clientNonce?: unknown;
        pending?: unknown;
        generations?: unknown;
      }
    : null;
  if (!source || (source.schema !== 1 && source.schema !== 2) || !source.pending || !source.generations) {
    return empty(freshClientNonce(createClientNonce));
  }
  const storedNonce = typeof source.clientNonce === "string" ? source.clientNonce.trim() : "";
  const clientNonce = CLIENT_NONCE_PATTERN.test(storedNonce) ? storedNonce : freshClientNonce(createClientNonce);
  const pending: Record<string, PendingVietQrCommand> = {};
  for (const [scope, raw] of Object.entries(source.pending as Record<string, unknown>)) {
    const candidate = raw && typeof raw === "object" ? raw as Partial<PendingVietQrCommand> : null;
    if (!candidate || typeof candidate.accountKey !== "string" || typeof candidate.fingerprint !== "string"
      || (candidate.action !== "CREATE" && candidate.action !== "CANCEL")
      || typeof candidate.key !== "string" || !COMMAND_KEY_PATTERN.test(candidate.key)) continue;
    const normalized: PendingVietQrCommand = {
      accountKey: candidate.accountKey.trim().toLowerCase(),
      action: candidate.action,
      fingerprint: candidate.fingerprint.trim(),
      key: candidate.key,
      ...(typeof candidate.intentNo === "string" && candidate.intentNo.trim().length <= 64
        ? { intentNo: candidate.intentNo.trim() }
        : {}),
    };
    try {
      if (identityScope(normalized) === scope) pending[scope] = normalized;
    } catch {
      // Local persistence is untrusted input. Invalid entries are retired
      // instead of being sent as payment commands.
    }
  }
  const generations: Record<string, number> = {};
  for (const [scope, generation] of Object.entries(source.generations as Record<string, unknown>)) {
    if (Number.isSafeInteger(generation) && Number(generation) >= 0 && Number(generation) <= MAX_GENERATION) {
      generations[scope] = Number(generation);
    }
  }
  return {
    schema: 2,
    clientNonce,
    pending,
    generations,
  };
}

function hash(value: string): string {
  let current = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    current = Math.imul(current ^ value.charCodeAt(index), 16777619);
  }
  return (current >>> 0).toString(36);
}

function advanceGeneration(
  state: VietQrCommandState,
  scope: string,
  createClientNonce: () => string,
): void {
  const nextGeneration = (state.generations[scope] ?? 0) + 1;
  if (nextGeneration > MAX_GENERATION) {
    state.clientNonce = freshClientNonce(createClientNonce);
    state.generations = {};
    return;
  }
  state.generations[scope] = nextGeneration;
}

export class VietQrCommandKeyRegistry {
  constructor(
    private readonly storage: VietQrCommandStorage,
    private readonly createClientNonce: () => string = defaultClientNonce,
  ) {}

  getOrCreate(identity: VietQrCommandIdentity): string {
    const scope = identityScope(identity);
    const state = parse(this.storage.read(), this.createClientNonce);
    const pending = state.pending[scope];
    if (pending) {
      // Persist a schema-1 migration before returning the legacy unknown key.
      // Once that command reaches a terminal state, the next key includes this
      // installation nonce and cannot collide with pre-reset history.
      this.storage.write(state);
      return pending.key;
    }
    const generation = state.generations[scope] ?? 0;
    const key = `vietqr-${hash(`${scope}\u0000${state.clientNonce}\u0000${generation}`)}-${hash(`${generation}\u0000${state.clientNonce}\u0000${scope}`)}`;
    state.pending[scope] = { ...identity, accountKey: identity.accountKey.trim().toLowerCase(), key };
    this.storage.write(state);
    return parse(this.storage.read(), this.createClientNonce).pending[scope]?.key ?? key;
  }

  bindIntent(identity: VietQrCommandIdentity, key: string, intentNo: string): void {
    const scope = identityScope(identity);
    const state = parse(this.storage.read(), this.createClientNonce);
    const pending = state.pending[scope];
    if (!pending || pending.key !== key || !intentNo.trim()) throw new Error("VIETQR_COMMAND_KEY_MISMATCH");
    state.pending[scope] = { ...pending, intentNo: intentNo.trim() };
    this.storage.write(state);
  }

  finish(identity: VietQrCommandIdentity, key: string): boolean {
    const scope = identityScope(identity);
    const state = parse(this.storage.read(), this.createClientNonce);
    if (state.pending[scope]?.key !== key) return false;
    delete state.pending[scope];
    advanceGeneration(state, scope, this.createClientNonce);
    this.storage.write(state);
    return true;
  }

  finishByIntent(accountKey: string, intentNo: string): boolean {
    const normalizedAccount = accountKey.trim().toLowerCase();
    const state = parse(this.storage.read(), this.createClientNonce);
    let changed = false;
    for (const [scope, pending] of Object.entries(state.pending)) {
      if (pending.accountKey !== normalizedAccount || pending.intentNo !== intentNo) continue;
      delete state.pending[scope];
      advanceGeneration(state, scope, this.createClientNonce);
      changed = true;
    }
    if (changed) this.storage.write(state);
    return changed;
  }
}

const registry = new VietQrCommandKeyRegistry({
  read: () => uni.getStorageSync(STORAGE_KEY),
  write: (value) => uni.setStorageSync(STORAGE_KEY, value),
});

export const vietQrCommandKey = (identity: VietQrCommandIdentity) => registry.getOrCreate(identity);
export const bindVietQrIntent = (identity: VietQrCommandIdentity, key: string, intentNo: string) =>
  registry.bindIntent(identity, key, intentNo);
export const finishVietQrCommand = (identity: VietQrCommandIdentity, key: string) => registry.finish(identity, key);
export const finishVietQrCommandByIntent = (accountKey: string, intentNo: string) =>
  registry.finishByIntent(accountKey, intentNo);
