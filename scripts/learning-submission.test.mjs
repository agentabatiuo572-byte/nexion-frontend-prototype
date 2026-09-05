/**
 * 学习提交的单飞(single-flight)契约。
 *
 * 【为什么从 src/api/learning-submission.test.ts 搬到这里】
 * 原文件用 vitest 写,而本仓**没有装 vitest** —— 结果是:
 *   ① 它从来没被任何 runner 跑过(全仓 grep 不到引用,是孤儿测试);
 *   ② 却因为在 tsconfig 的 include 里、import 了不存在的模块,让 `npm run type-check` 常红。
 * 一个从不执行、又持续弄红类型检查的测试,是纯负债。改用仓内既有惯例:
 * `node --test` + `scripts/*.test.mjs` + 契约登记表,让它真的跑起来。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createSingleFlight } from "../src/api/learning-submission.ts";

test("coalesces a double tap into exactly one submit request", async () => {
  let calls = 0;
  const submit = createSingleFlight(async () => {
    calls += 1;
    await Promise.resolve();
    return { completed: true };
  });

  const first = submit();
  const second = submit();

  // 双击必须拿到**同一个** promise,而不是各自发一次请求。
  assert.equal(first, second);
  assert.deepEqual(await first, { completed: true });
  assert.equal(calls, 1);
});

test("clears the flight after a failed request without replaying it", async () => {
  let calls = 0;
  const submit = createSingleFlight(async () => {
    calls += 1;
    throw new Error("request failed");
  });

  await assert.rejects(submit(), /request failed/);
  // 失败不该被静默重放:调用次数仍然只有一次。
  assert.equal(calls, 1);
});
