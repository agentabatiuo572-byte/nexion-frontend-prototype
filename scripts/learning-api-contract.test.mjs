/**
 * 学习接口的两条契约:奖励金额格式非法必须 fail-closed、幂等键必须在请求体之外。
 *
 * 【为什么从 src/api/learning-api-contract.test.ts 搬到这里】
 * 原文件用 vitest 写,而本仓**没有装 vitest** —— 于是它既没被任何 runner 跑过
 * (孤儿测试),又因 import 不存在的模块让 `npm run type-check` 常红。
 * 改用仓内既有惯例:`node --test` + `scripts/*.test.mjs` + 契约登记表。
 *
 * 🔴 这两条测的是**钱**:rewardNex 的金额格式一旦被当成对象/数字放行,
 * 后面就是按错误金额发奖;幂等键跑进请求体则会让服务端的去重键与客户端不一致。
 * 所以它们不该因为"框架没装"而长期不跑。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createLearningApi } from "../src/api/learning-api.ts";

test("fails closed when a quiz response contains a malformed reward amount", async () => {
  const api = createLearningApi({
    request: async () => ({
      courseId: "h3-live-20260722",
      version: "v1",
      score: 100,
      passed: true,
      completed: true,
      rewardGranted: true,
      // 合法形态是定点字符串(如 "20.000000");给对象就该被判非法而不是勉强解读。
      rewardNex: { amount: 20 },
      attempts: 1,
    }),
  });

  await assert.rejects(
    api.submitQuiz("h3-live-20260722", [0], "learning-quiz:h3-live-20260722:v1"),
    (err) => {
      assert.equal(err.kind, "protocol");
      assert.equal(err.message, "LEARNING_RESPONSE_INVALID");
      return true;
    },
  );
});

test("sends the stable H3 idempotency key outside the request body", async () => {
  let request;
  const api = createLearningApi({
    request: async (value) => {
      request = value;
      return {
        courseId: "h3-live-20260722",
        version: "v1",
        score: 100,
        passed: true,
        completed: true,
        rewardGranted: true,
        rewardNex: "20.000000",
        attempts: 1,
      };
    },
  });

  await api.submitQuiz("h3-live-20260722", [0], "learning-quiz:h3-live-20260722:v1");

  assert.deepEqual(request, {
    method: "POST",
    path: "/api/content/learning/courses/h3-live-20260722/quiz",
    idempotencyKey: "learning-quiz:h3-live-20260722:v1",
    body: { answers: [0] },
  });
});
