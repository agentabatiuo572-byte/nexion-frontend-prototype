import { runPassiveTabRead, invalidatePassiveTabRead, invalidateBeforePassiveTabRead, rememberPassiveTabRead } from "@/lib/passive-tab-read";
import { isHttpReadRateLimit, isTransientReadFailure } from "@/lib/remote-read-failure";
import { ref, watch } from "vue";
import { defineStore } from "pinia";
import { apiRuntimeConfig, referralRewardApi, remoteApiEnabled } from "@/api/runtime";
import type { ReferralRewardSnapshot } from "@/api/referral-reward-api";
import { captureRuntimeRevision, isCurrentRuntimeRevision, type RuntimeRevisionScope } from "@/api/order-api";
import { createRemoteAccountEpoch, type RemoteAccountRequest } from "@/lib/remote-account-epoch";

export const useReferralReward = defineStore("referralReward", () => {
  const snapshot = ref<ReferralRewardSnapshot | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const accountScope = createRemoteAccountEpoch();
  let refreshGeneration = 0;
  const rateLimited = ref(false);
  const transientFailure = ref(false);
  let retryAt = 0;
  let environmentInvalidated = false;
  let inFlight: { account: RemoteAccountRequest; runtime: RuntimeRevisionScope; limit: number; promise: Promise<boolean> } | null = null;

  function ensure(limit = 10): Promise<boolean> {
    if (Date.now() < retryAt) return Promise.resolve(false);
    return runPassiveTabRead("referral-reward", () => inFlight && inFlight.limit === limit && accountScope.isCurrent(inFlight.account) && isCurrentRuntimeRevision(inFlight.runtime)
      ? inFlight.promise : refresh(limit), [accountScope.snapshot(), captureRuntimeRevision(), limit]);
  }

  function refresh(limit = 10): Promise<boolean> {
    invalidateBeforePassiveTabRead("referral-reward");
    if (environmentInvalidated || Date.now() < retryAt) return Promise.resolve(false);
    const account = accountScope.snapshot(), runtime = captureRuntimeRevision();
    const promise = read(limit);
    rememberPassiveTabRead("referral-reward", promise, [account, runtime, limit]);
    inFlight = { account, runtime, limit, promise };
    const clear = () => { if (inFlight?.promise === promise) inFlight = null; };
    void promise.then(clear, clear);
    return promise;
  }

  async function read(limit: number): Promise<boolean> {
    if (!remoteApiEnabled) {
      snapshot.value = null;
      error.value = "REFERRAL_REWARD_SERVER_REQUIRED";
      return false;
    }
    const request: RemoteAccountRequest = accountScope.snapshot();
    const runScope: RuntimeRevisionScope = captureRuntimeRevision();
    const generation = ++refreshGeneration;
    snapshot.value = null;
    loading.value = true;
    // 🔴 error **不在 await 之前清**。清早了的后果:出错态的「点击重试」是靠 error 渲染的,
    //   用户一点,这一句同步把 error 置空 → 下一次 flush 就把那个按钮从 DOM 上换掉,
    //   请求还在路上,按钮却已经在手指底下消失了(再点一次落空)。
    //   改成「成功才清」:重试期间错误态原样留着,请求回来才翻页;失败由 catch 覆写。
    try {
      const next = await referralRewardApi.snapshot(limit);
      if (generation !== refreshGeneration || !accountScope.isCurrent(request) || !isCurrentRuntimeRevision(runScope)) return false;
      snapshot.value = next;
      error.value = null; retryAt = 0; rateLimited.value = false; transientFailure.value = false;
      return true;
    } catch (cause) {
      if (generation === refreshGeneration && accountScope.isCurrent(request) && isCurrentRuntimeRevision(runScope)) {
        snapshot.value = null;
        rateLimited.value = isHttpReadRateLimit(cause);
        transientFailure.value = isTransientReadFailure(cause);
        if (isHttpReadRateLimit(cause)) retryAt = Date.now() + (cause.retryAfterMs ?? 30_000);
        error.value = cause instanceof Error ? cause.message : "REFERRAL_REWARD_LOAD_FAILED";
      } else if (generation === refreshGeneration) {
        snapshot.value = null;
        error.value = null;
      }
      return false;
    } finally {
      if (generation === refreshGeneration) loading.value = false;
    }
  }

  watch(() => [apiRuntimeConfig.environment, apiRuntimeConfig.baseUrl], () => {
    invalidatePassiveTabRead("referral-reward");
    environmentInvalidated = true; refreshGeneration += 1; inFlight = null; retryAt = 0;
    snapshot.value = null; error.value = null; loading.value = false; rateLimited.value = false; transientFailure.value = false;
  }, { flush: "sync" });

  function invalidateReadOwner(): void {
    invalidatePassiveTabRead("referral-reward");

    transientFailure.value = false;
    refreshGeneration += 1; inFlight = null; snapshot.value = null; loading.value = false;
    if (Date.now() >= retryAt) { error.value = null; rateLimited.value = false; }
  }

  function bindAccount(accountKey: string) {
    accountScope.bind(accountKey);
    refreshGeneration += 1;
    inFlight = null; retryAt = 0; rateLimited.value = false; transientFailure.value = false;
    snapshot.value = null;
    error.value = null;
    void refresh();
  }
  return { snapshot, loading, error, rateLimited, transientFailure, refresh, ensure, invalidateReadOwner, bindAccount };
});
