import { computed } from "vue";
import { useLocaleStore } from "@/store/locale";

export const remainderUiCopy = {
  zh: {
    earnWays: {
      phoneTitle: "手机算力", phoneBody: "Android 手机参与计算。", phoneAction: "设置手机", phoneReadOnly: "手机状态",
      stakingBody: "期限及提前退出规则。",
      gpuTitle: "共享电脑算力", gpuBody: "闲置 GPU · 占 1 个槽位", gpuAction: "查看连接方式",
    },
    phoneTitle: "手机算力", phoneBody: "在 Android APP 中连接并校准手机，参与算力作业。",
    phoneAction: "设置手机算力", phoneReadOnly: "查看手机状态", downloadApp: "下载 APP",
    stakingTitle: "质押", stakingBody: "查看可用期限、预估收益与提前退出规则。", stakingAction: "查看质押",
    genesisSupply: "限量 {n} 席 · 售完即止",
    listingMinutes: "{n} 分钟", listingHours: "{n} 小时", listingDays: "{n} 天",
  },
  en: {
    earnWays: {
      phoneTitle: "Phone compute", phoneBody: "Compute on Android.", phoneAction: "Set up phone", phoneReadOnly: "Phone status",
      stakingBody: "Terms and early exit rules.",
      gpuTitle: "Share GPU power", gpuBody: "Idle GPU · 1 slot", gpuAction: "How to connect",
    },
    phoneTitle: "Phone compute", phoneBody: "Connect and calibrate your phone in the Android app to run compute jobs.",
    phoneAction: "Set up phone compute", phoneReadOnly: "View phone status", downloadApp: "Download app",
    stakingTitle: "Staking", stakingBody: "View available terms, estimated returns and early exit rules.", stakingAction: "View staking",
    genesisSupply: "Limited to {n} seats · Until sold out",
    listingMinutes: "{n} minutes", listingMinute: "1 minute", listingHours: "{n} hours", listingHour: "1 hour", listingDays: "{n} days", listingDay: "1 day",
  },
  vi: {
    earnWays: {
      phoneTitle: "Tính toán di động", phoneBody: "Kết nối điện thoại Android.", phoneAction: "Thiết lập", phoneReadOnly: "Trạng thái điện thoại",
      stakingBody: "Kỳ hạn và quy tắc rút sớm.",
      gpuTitle: "Chia sẻ GPU", gpuBody: "GPU nhàn rỗi · 1 khe", gpuAction: "Cách kết nối",
    },
    phoneTitle: "Tính toán trên điện thoại", phoneBody: "Kết nối và hiệu chuẩn điện thoại trong ứng dụng Android để chạy tác vụ tính toán.",
    phoneAction: "Thiết lập điện thoại", phoneReadOnly: "Xem trạng thái điện thoại", downloadApp: "Tải ứng dụng",
    stakingTitle: "Staking", stakingBody: "Xem kỳ hạn, lợi nhuận ước tính và quy tắc rút sớm.", stakingAction: "Xem staking",
    genesisSupply: "Giới hạn {n} suất · Đến khi bán hết",
    listingMinutes: "{n} phút", listingHours: "{n} giờ", listingDays: "{n} ngày",
  },
};

export function useRemainderUiCopy() {
  const locale = useLocaleStore();
  return computed(() => remainderUiCopy[locale.code === "zh" || locale.code === "vi" ? locale.code : "en"]);
}
