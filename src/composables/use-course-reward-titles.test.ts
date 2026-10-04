import { effectScope, nextTick, reactive, type EffectScope } from "vue";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  onShow: [] as Array<() => void>,
  courses: vi.fn(),
}));
const app = reactive({ accountKey: "account-42", accountBindingEpoch: 1 });
const auth = reactive({ isAuthenticated: true, accountId: "42" });
const locale = reactive({ code: "en" });

vi.mock("@dcloudio/uni-app", () => ({ onShow: (callback: () => void) => mocks.onShow.push(callback) }));
vi.mock("@/api/learning-runtime", () => ({ learningApi: { courses: mocks.courses } }));
vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true, sessionVault: { read: () => ({ user: { userId: 42 } }) } }));
vi.mock("@/lib/binary-session-ready", () => ({ binarySessionReady: () => true }));
vi.mock("@/store/app", () => ({ useApp: () => app }));
vi.mock("@/store/auth", () => ({ useAuth: () => auth }));
vi.mock("@/store/locale", () => ({ useLocaleStore: () => locale }));

import { useCourseRewardTitles } from "./use-course-reward-titles";

let scope: EffectScope;
beforeEach(() => {
  mocks.onShow.length = 0;
  mocks.courses.mockReset();
  app.accountBindingEpoch = 1;
  auth.accountId = "42";
  locale.code = "en";
  scope = effectScope();
});
afterEach(() => scope.stop());

async function flush() { await Promise.resolve(); await nextTick(); }

test("keeps a verified title on a transient failure and clears it for another account or language", async () => {
  const ref = "nexgrid-account-safety-202609@v1";
  mocks.courses.mockResolvedValueOnce({ courses: [], rewardTitles: { [ref]: "Account safety" } });
  const titles = scope.run(() => useCourseRewardTitles())!;
  mocks.onShow[0]();
  await flush();
  expect(titles.value[ref]).toBe("Account safety");

  mocks.courses.mockRejectedValueOnce(new Error("503"));
  mocks.onShow[0]();
  await flush();
  expect(titles.value[ref]).toBe("Account safety");

  mocks.courses.mockImplementationOnce(() => new Promise(() => {}));
  locale.code = "zh";
  await nextTick();
  expect(titles.value).toEqual({});

  mocks.courses.mockResolvedValueOnce({ courses: [], rewardTitles: { [ref]: "账户安全" } });
  mocks.onShow[0]();
  await flush();
  expect(titles.value[ref]).toBe("账户安全");

  mocks.courses.mockImplementationOnce(() => new Promise(() => {}));
  auth.accountId = "43";
  app.accountBindingEpoch += 1;
  await nextTick();
  expect(titles.value).toEqual({});
});
