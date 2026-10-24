import { computed, watch } from "vue";
import { onShow, onHide } from "@dcloudio/uni-app";
import { useConfig } from "@/store/config";

/** Hide protected content immediately and recover direct links to the wallet. */
export function useStakingPageVisibility() {
  const config = useConfig();
  const enabled = computed(() => config.isEnabled("stakingVisible"));
  let visible = false;
  const recover = () => {
    if (visible && !enabled.value) uni.reLaunch({ url: "/pages/me/wallet" });
  };
  onShow(() => { visible = true; recover(); });
  onHide(() => { visible = false; });
  watch(enabled, recover, { flush: "sync" });
  return enabled;
}
