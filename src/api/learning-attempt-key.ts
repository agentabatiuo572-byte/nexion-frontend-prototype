export interface LearningAttemptIdentity {
  accountKey: string;
  courseId: string;
  version: string;
}

interface PendingLearningAttempt extends LearningAttemptIdentity { key: string; }
interface LearningAttemptState {
  schema: 1;
  pending: Record<string, PendingLearningAttempt>;
  generations: Record<string, number>;
}
export interface LearningAttemptStorage { read(): unknown; write(value: LearningAttemptState): void; }

const STORAGE_KEY = "nexgrid-learning-pending-attempts-v1";
const empty = (): LearningAttemptState => ({ schema: 1, pending: {}, generations: {} });

function normalize(value: LearningAttemptIdentity): LearningAttemptIdentity {
  const accountKey = value.accountKey.trim().toLowerCase();
  const courseId = value.courseId.trim();
  const version = value.version.trim();
  if (!accountKey || !courseId || !version) throw new Error("LEARNING_ATTEMPT_IDENTITY_INVALID");
  return { accountKey, courseId, version };
}
function scopeOf(value: LearningAttemptIdentity): string { const item = normalize(value); return JSON.stringify([item.accountKey, item.courseId, item.version]); }
function hash53(value: string, seed: number): string {
  let h1 = 0xdeadbeef ^ seed; let h2 = 0x41c6ce57 ^ seed;
  for (let index = 0; index < value.length; index += 1) { const code = value.charCodeAt(index); h1 = Math.imul(h1 ^ code, 2654435761); h2 = Math.imul(h2 ^ code, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}
function key(scope: string, generation: number): string { return `learning-quiz-${hash53(`${scope}\u0000${generation}`, 0)}${hash53(`${scope}\u0000${generation}`, 0x9e3779b9)}`; }
function state(value: unknown): LearningAttemptState {
  const candidate = value && typeof value === "object" ? value as Partial<LearningAttemptState> : null;
  if (!candidate || candidate.schema !== 1 || !candidate.pending || !candidate.generations || typeof candidate.pending !== "object" || typeof candidate.generations !== "object") return empty();
  const pending: Record<string, PendingLearningAttempt> = {};
  for (const [scope, item] of Object.entries(candidate.pending)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Partial<PendingLearningAttempt>;
    if (typeof row.key !== "string" || typeof row.accountKey !== "string" || typeof row.courseId !== "string" || typeof row.version !== "string") continue;
    pending[scope] = { key: row.key, accountKey: row.accountKey, courseId: row.courseId, version: row.version };
  }
  const generations: Record<string, number> = {};
  for (const [scope, generation] of Object.entries(candidate.generations)) if (Number.isSafeInteger(generation) && Number(generation) >= 0) generations[scope] = Number(generation);
  return { schema: 1, pending, generations };
}

// 🔴 落盘失败的分档语义(提交**之前**抛 / **之后**只回布尔)见 lib/funds-mutation-key.ts
// 那一整段头注 —— 同一条家规。这里不是钱面,但**不能降级成「照发」**,理由与钱面不同:
// 本表的键对同一 (账号, 课程, 版本) 是确定性的,只有 finish 推进 generation 才会换新键。
// 写不进去 = generation 永远停在原处 = 用户重做这门测验时拿到**同一把键**,服务端按幂等
// 契约原样重放第一次的卷面 —— 成绩与 NEX 奖励就此**永久**锁死在第一次误交的那份上。
// 那正是 pages/learn/course.vue 头注里被独立审计判为 P0 的同一个形状。相比之下「存储满时
// 这一次交不上卷、给出错误让用户腾空间再交」没有任何不可逆后果,所以照样 fail closed。
//
// ⚠️ 本模块当前**没有任何生产调用方**(全仓 sweep 2026-08-19:只有它自己的单测)。
// course.vue 交卷用的是它自己现造的一次性键(`learning-quiz:<id>:<version>:<Date.now>`),
// 正是上面那次 P0 之后改的。谁要把本模块接上去,先读 course.vue 那段头注 ——
// 「跨重做恒定不变的键」是被推翻过的设计,不是可选项。

/** 写盘。true = 真落盘了;false = 存储写不进去(配额满 / 站点数据被禁)。 */
function persisted(write: () => void): boolean {
  try { write(); return true; } catch { return false; }
}
/** 读盘。null = 存储读不出来(≠「表里没有这一条」)。 */
function readState(storage: LearningAttemptStorage): LearningAttemptState | null {
  try { return state(storage.read()); } catch { return null; }
}

export class LearningAttemptKeyRegistry {
  constructor(private readonly storage: LearningAttemptStorage) {}
  /** 🔴 交卷**之前**:键落不了盘就抛,这一次不许交(fail closed,理由见上)。 */
  getOrCreate(identity: LearningAttemptIdentity): string {
    const item = normalize(identity); const scope = scopeOf(item); const current = state(this.storage.read());
    if (current.pending[scope]) return current.pending[scope].key;
    const value = key(scope, current.generations[scope] ?? 0);
    current.pending[scope] = { ...item, key: value };
    if (!persisted(() => this.storage.write(current))) throw new Error("LEARNING_ATTEMPT_KEY_UNPERSISTED");
    return state(this.storage.read()).pending[scope]?.key ?? value;
  }
  /** 交卷**之后**:false = 没退役(表里没有 / 存储读不出 / 写不进)。不抛 —— 卷已经判完了。 */
  finish(identity: LearningAttemptIdentity, attemptKey: string): boolean {
    const scope = scopeOf(identity); const current = readState(this.storage);
    if (!current) return false;
    if (!current.pending[scope] || current.pending[scope].key !== attemptKey) return false;
    delete current.pending[scope]; current.generations[scope] = (current.generations[scope] ?? 0) + 1;
    return persisted(() => this.storage.write(current));
  }
}

const storage: LearningAttemptStorage = { read: () => uni.getStorageSync(STORAGE_KEY), write: (value) => uni.setStorageSync(STORAGE_KEY, value) };
const registry = new LearningAttemptKeyRegistry(storage);
export function pendingLearningAttemptKey(identity: LearningAttemptIdentity): string { return registry.getOrCreate(identity); }
export function finishPendingLearningAttempt(identity: LearningAttemptIdentity, key: string): boolean { return registry.finish(identity, key); }
