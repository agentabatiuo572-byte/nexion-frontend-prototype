import { ref } from "vue";
import { defineStore } from "pinia";
import { referralRewardApi, remoteApiEnabled } from "@/api/runtime";
import type { ReferralRewardSnapshot } from "@/api/referral-reward-api";

export const useReferralReward = defineStore("referralReward", () => {
  const snapshot = ref<ReferralRewardSnapshot | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let accountEpoch = 0;

  async function refresh(limit = 10): Promise<boolean> {
    if (!remoteApiEnabled) {
      snapshot.value = null;
      error.value = "REFERRAL_REWARD_SERVER_REQUIRED";
      return false;
    }
    const epoch = accountEpoch;
    loading.value = true;
    // 🔴 error **不在 await 之前清**。清早了的后果:出错态的「点击重试」是靠 error 渲染的,
    //   用户一点,这一句同步把 error 置空 → 下一次 flush 就把那个按钮从 DOM 上换掉,
    //   请求还在路上,按钮却已经在手指底下消失了(再点一次落空)。
    //   改成「成功才清」:重试期间错误态原样留着,请求回来才翻页;失败由 catch 覆写。
    try {
      const next = await referralRewardApi.snapshot(limit);
      if (epoch !== accountEpoch) return false;
      snapshot.value = next;
      error.value = null;
      return true;
    } catch (cause) {
      if (epoch === accountEpoch) {
        snapshot.value = null;
        error.value = cause instanceof Error ? cause.message : "REFERRAL_REWARD_LOAD_FAILED";
      }
      return false;
    } finally {
      if (epoch === accountEpoch) loading.value = false;
    }
  }

  function bindAccount(_accountKey: string) {
    accountEpoch += 1;
    snapshot.value = null;
    error.value = null;
    void refresh();
  }
  return { snapshot, loading, error, refresh, bindAccount };
});
