const copy = {
  zh: {
    learn: "了解创世节点",
    empty: "可先查看创世节点介绍、交易规则与风险说明。",
    holderIntro: "了解节点权益与风险；如已购买，可在此查看持有记录。",
    trust: "信任与披露",
  },
  en: {
    learn: "About Genesis nodes",
    empty: "Explore Genesis nodes, trading rules and risk disclosures.",
    holderIntro: "Explore node benefits and risks. If you have purchased nodes, view your holdings here.",
    trust: "Trust and disclosures",
  },
  vi: {
    learn: "Tìm hiểu nút Genesis",
    empty: "Xem giới thiệu nút Genesis, quy tắc giao dịch và thông tin rủi ro.",
    holderIntro: "Tìm hiểu quyền lợi và rủi ro. Nếu đã mua nút, bạn có thể xem thông tin sở hữu tại đây.",
    trust: "Tin cậy và công bố",
  },
};

export function genesisConsumerCopyFor(locale: string) {
  return copy[locale === "zh" || locale === "vi" ? locale : "en"];
}
