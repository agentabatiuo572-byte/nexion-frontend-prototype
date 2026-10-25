const copy = {
  zh: {
    loading: "正在加载证明资料",
    loadingHint: "加载完成后可复制链接、分享或保存卡片。",
    unavailable: "证明资料暂时无法加载",
    unavailableHint: "请重试，加载完成后可继续分享。",
    linkUnavailable: "分享链接暂时不可用",
    linkUnavailableHint: "请重新加载资料后再复制、分享或保存卡片。",
  },
  en: {
    loading: "Loading proof details",
    loadingHint: "Once loaded, you can copy the link, share or save your card.",
    unavailable: "Proof details could not be loaded",
    unavailableHint: "Retry loading the details to continue sharing.",
    linkUnavailable: "Sharing link is unavailable",
    linkUnavailableHint: "Reload the details before copying, sharing or saving your card.",
  },
  vi: {
    loading: "Đang tải thông tin chứng minh",
    loadingHint: "Sau khi tải xong, bạn có thể sao chép liên kết, chia sẻ hoặc lưu thẻ.",
    unavailable: "Chưa tải được thông tin chứng minh",
    unavailableHint: "Thử tải lại thông tin để tiếp tục chia sẻ.",
    linkUnavailable: "Liên kết chia sẻ chưa khả dụng",
    linkUnavailableHint: "Tải lại thông tin trước khi sao chép, chia sẻ hoặc lưu thẻ.",
  },
};

export function proofRecoveryCopyFor(locale: string) {
  return copy[locale === "zh" || locale === "vi" ? locale : "en"];
}
