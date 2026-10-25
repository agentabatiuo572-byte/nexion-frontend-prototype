import { computed } from "vue";
import { useLocaleStore } from "@/store/locale";

export const deviceStatisticsCapabilityCopy = {
  zh: {
    currentStatus: "当前状态",
    scope: "可查看今日收益、累计收益和最近完成的作业。尚不提供按日收益曲线及历史在线率。",
  },
  en: {
    currentStatus: "Current status",
    scope: "Today's earnings, total earnings and recent completed jobs are available. Daily earnings charts and historical online rates are not offered yet.",
  },
  vi: {
    currentStatus: "Trạng thái hiện tại",
    scope: "Có thể xem thu nhập hôm nay, tổng thu nhập và các tác vụ hoàn thành gần đây. Chưa có biểu đồ thu nhập theo ngày và tỷ lệ trực tuyến trong quá khứ.",
  },
};

export function useDeviceStatisticsCapabilityCopy() {
  const locale = useLocaleStore();
  return computed(() => deviceStatisticsCapabilityCopy[locale.code === "zh" || locale.code === "vi" ? locale.code : "en"]);
}
