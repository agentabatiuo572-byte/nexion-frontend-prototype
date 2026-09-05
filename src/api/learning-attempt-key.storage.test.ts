/**
 * 测验 attempt 幂等键的**存储故障**契约(2026-08-19,同族见 lib/funds-mutation-key.storage.test)。
 *
 * 这里不是钱面,但**也不许降级成「照发」**,理由与钱面不同:本表的键对同一
 * (账号, 课程, 版本) 是确定性的,只有 finish 推进 generation 才换新键。写不进去 =
 * generation 永远停在原处 = 用户重做这门测验拿到**同一把键**,服务端按幂等契约原样重放
 * 第一次的卷面 —— 成绩与 NEX 奖励永久锁死在第一次误交的那份上(pages/learn/course.vue
 * 头注里被独立审计判为 P0 的同一形状)。相比之下「存储满时这一次交不上卷」完全可逆。
 *
 * ⚠️ 本模块当前没有生产调用方(course.vue 用它自己现造的一次性键)。这份契约先焊在这里,
 * 保证它哪天被接上去时,存储故障不会静默变成那个 P0。
 */
import { beforeEach, describe, expect, it } from "vitest";

const memory = new Map<string, unknown>();
let storageBroken = false;
let readBroken = false;
(globalThis as unknown as { uni: unknown }).uni = {
  getStorageSync: (k: string) => {
    if (readBroken) {
      const err = new Error("SecurityError");
      err.name = "SecurityError";
      throw err;
    }
    return memory.has(k) ? JSON.parse(JSON.stringify(memory.get(k))) : "";
  },
  setStorageSync: (k: string, v: unknown) => {
    if (storageBroken) {
      const err = new Error("QuotaExceededError");
      err.name = "QuotaExceededError";
      throw err;
    }
    memory.set(k, JSON.parse(JSON.stringify(v)));
  },
  removeStorageSync: (k: string) => { memory.delete(k); },
  getStorageInfoSync: () => ({ keys: [...memory.keys()] }),
};

const { pendingLearningAttemptKey, finishPendingLearningAttempt } = await import("./learning-attempt-key");

const STORAGE_KEY = "nexgrid-learning-pending-attempts-v1";
const IDENTITY = { accountKey: "user-42", courseId: "course-a", version: "v2" };

describe("learning attempt key storage-failure contract", () => {
  beforeEach(() => { memory.clear(); storageBroken = false; readBroken = false; });

  it("baseline: 一把键跨重载复用,判卷定局后才换新键", () => {
    const first = pendingLearningAttemptKey(IDENTITY);
    expect(pendingLearningAttemptKey(IDENTITY)).toBe(first);
    expect(finishPendingLearningAttempt(IDENTITY, first)).toBe(true);
    expect(pendingLearningAttemptKey(IDENTITY)).not.toBe(first);
  });

  it("交卷前写不进去 → 抛域码、不交出任何键(fail closed)", () => {
    storageBroken = true;
    // 放行的话:这把键退役不掉,用户重做这门课永远拿回第一次那份卷的成绩与奖励。
    expect(() => pendingLearningAttemptKey(IDENTITY)).toThrow(/LEARNING_ATTEMPT_KEY_UNPERSISTED/);
    expect(memory.has(STORAGE_KEY)).toBe(false);
  });

  it("存储恢复后照常发键", () => {
    storageBroken = true;
    expect(() => pendingLearningAttemptKey(IDENTITY)).toThrow();
    storageBroken = false;
    expect(pendingLearningAttemptKey(IDENTITY)).toMatch(/^learning-quiz-/);
  });

  it("🔴 卷已交出去之后写不进去 → 绝不抛,只如实回 false", () => {
    const key = pendingLearningAttemptKey(IDENTITY);
    // 服务端已经判完卷、可能已经发了 NEX 奖励,此刻配额满。
    storageBroken = true;
    // 回归点:修复前这里抛出去,调用方的成绩渲染 / 奖励提示全部走不到 —— 判了卷的用户看到失败。
    expect(() => finishPendingLearningAttempt(IDENTITY, key)).not.toThrow();
    expect(finishPendingLearningAttempt(IDENTITY, key)).toBe(false);
    storageBroken = false;
    // false 是诚实的:没退役 = 键还在,不会凭空换一把让下一次交卷绕过幂等。
    expect(pendingLearningAttemptKey(IDENTITY)).toBe(key);
  });

  it("🔴 站点数据被禁(连读都抛)时 finish 仍然是全函数", () => {
    const key = pendingLearningAttemptKey(IDENTITY);
    readBroken = true;
    expect(finishPendingLearningAttempt(IDENTITY, key)).toBe(false);
  });
});
