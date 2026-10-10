import type { HowContentDocument } from "@/api/how-content-api";
import type { CommissionGuideRates, CommissionGuideRules } from "@/api/commission-guide-api";
import type { DirectReferralPolicy, DirectReferralRule } from "@/api/direct-referral-api";
import type { CanonicalVRankRow } from "@/api/v-rank-api";
import { formatHowNumber } from "./rank-how-content";

export interface CommissionsHowSnapshot { document: HowContentDocument; rates?: CommissionGuideRates; directPolicy: DirectReferralPolicy; guide: CommissionGuideRules; ranks: CanonicalVRankRow[] }
// Keep public settlement facts; current direct policy values come from the server.
const COPY = {
  zh: {
    purchaseBudget: "直属购买奖励比例", purchaseReplacement: "拆分所得 NEX 替代该笔购买的额外 NEX 奖励，不另行重复发放", purchaseOriginal: "直属购买奖励按当前奖励方案结算；网络购买奖励按对应规则结算", networkPurchase: "网络购买奖励包含额外 NEX 奖励，金额以适用规则及实际结算为准", deviceScope: "设备收益仅奖励直接邀请人；平台额外支付，成员原收益不扣减",
    loading: "正在读取最新说明与佣金规则…", unavailable: "说明或规则暂不可用，请重新加载。", missing: "规则暂不可用，请以实际记录为准", none: "暂无可展示的奖励", retry: "重新加载",
    days: "天", dailyCap: "日封顶", settlementPeriod: "结算周期", residualHandling: "剩余业绩处理", minRank: "参与起点", monthlyCap: "月上限",
    daily: "每日", weekly: "每周", monthly: "每月", monthlyClear: "每月清零", perPairClear: "每次对碰清零", carryForward: "转结", paused: "已暂停", unpaused: "未暂停；仍须满足实际结算资格",
    hold: "领导池当前不开放结算", unsupported: "尚未开放独立佣金派发，请以实际记录为准", supported: "是否触发与到账以实际事件为准",
    network: "网络奖励的金额和到账状态以实际结算记录及钱包账单为准。", records: "奖励金额和到账状态以实际结算记录及钱包账单为准。", cultivation: "培育奖励请按实际奖励记录核对接收人和到账金额。",
    exampleScope: "以下金额仅作算例，不代表个人收益。假设订单基数：", exampleNetwork: "网络奖励算例", exampleCultivation: "培育奖励算例，不代表个人到账金额",
    noTotal: "非实际收益合计", pendingAmount: "需实际结算", unknownAmount: "—", base: "假设订单基数", configured: "奖励标准", notOpen: "未开放", notConfigured: "暂不可用",
    purchase: "直属购买", deviceEarning: "直属设备收益", totalRate: "总分成", split: "奖励拆分", directOnly: "仅直接邀请成员；平台额外支付，成员原收益不扣减", priceUnavailable: "NEX价格暂不可用，等待有效价格后处理",
  },
  en: {
    purchaseBudget: "Direct purchase reward rate", purchaseReplacement: "The NEX share replaces the extra NEX reward for this purchase; no separate extra NEX reward is paid", purchaseOriginal: "Direct purchase rewards follow the current reward plan; network purchase rewards follow their applicable rules", networkPurchase: "Network purchase rewards include extra NEX; amounts are subject to the applicable rules and actual settlement", deviceScope: "Device earnings reward only the direct inviter; the platform pays extra and members keep their original earnings",
    loading: "Loading the latest explanation and commission rules…", unavailable: "Explanation or rules unavailable. Please reload.", missing: "Rules are temporarily unavailable; check the actual records", none: "No rewards to display", retry: "Reload",
    days: "days", dailyCap: "daily cap", settlementPeriod: "Settlement period", residualHandling: "Remaining volume handling", minRank: "entry rank", monthlyCap: "monthly cap",
    daily: "daily", weekly: "weekly", monthly: "monthly", monthlyClear: "monthly reset", perPairClear: "reset per match", carryForward: "carry forward", paused: "paused", unpaused: "not paused; actual settlement eligibility still applies",
    hold: "Leadership pool settlement is not open", unsupported: "Independent commission payouts are not available; check actual records", supported: "Triggering and payment depend on actual events",
    network: "Check settlement records and wallet statements for network reward amounts and payment status.", records: "Check settlement records and wallet statements for reward amounts and payment status.", cultivation: "Check cultivation reward records for the recipient and amount received.",
    exampleScope: "These amounts are illustrations, not personal earnings. Hypothetical order base:", exampleNetwork: "Network reward illustration", exampleCultivation: "Cultivation reward illustration, not a personal payment",
    noTotal: "Not an earnings total", pendingAmount: "Requires settlement", unknownAmount: "—", base: "Hypothetical order base", configured: "Reward amount under the rules", notOpen: "Not available", notConfigured: "Temporarily unavailable",
    purchase: "Direct purchase", deviceEarning: "Direct device earnings", totalRate: "Total reward", split: "Reward split", directOnly: "Directly invited members only; the platform pays extra and members keep their original earnings", priceUnavailable: "NEX price unavailable; awaiting a valid price",
  },
  vi: {
    purchaseBudget: "Tỷ lệ thưởng mua trực tiếp", purchaseReplacement: "Phần NEX được chia thay thế thưởng NEX bổ sung của giao dịch mua này; khoản thưởng bổ sung đó không được trả riêng", purchaseOriginal: "Thưởng mua trực tiếp theo chương trình thưởng hiện tại; thưởng mua trong mạng lưới theo quy tắc tương ứng", networkPurchase: "Thưởng mua trong mạng lưới bao gồm NEX bổ sung; số tiền theo quy tắc áp dụng và kết quả quyết toán thực tế", deviceScope: "Thu nhập thiết bị chỉ thưởng người mời trực tiếp; nền tảng trả thêm và thành viên giữ nguyên thu nhập",
    loading: "Đang tải hướng dẫn và quy tắc hoa hồng mới nhất…", unavailable: "Chưa có hướng dẫn hoặc quy tắc. Vui lòng tải lại.", missing: "Quy tắc hiện chưa khả dụng; vui lòng xem bản ghi thực tế", none: "Chưa có phần thưởng để hiển thị", retry: "Tải lại",
    days: "ngày", dailyCap: "giới hạn ngày", settlementPeriod: "Chu kỳ quyết toán", residualHandling: "Xử lý doanh số còn lại", minRank: "hạng tham gia", monthlyCap: "giới hạn tháng",
    daily: "hằng ngày", weekly: "hằng tuần", monthly: "hằng tháng", monthlyClear: "xóa theo tháng", perPairClear: "xóa sau mỗi đối ứng", carryForward: "chuyển tiếp", paused: "đã tạm dừng", unpaused: "chưa tạm dừng; vẫn cần đáp ứng điều kiện quyết toán",
    hold: "Quỹ lãnh đạo hiện chưa mở quyết toán", unsupported: "Chưa mở trả hoa hồng độc lập; xem bản ghi thực tế", supported: "Phát sinh và chi trả theo sự kiện thực tế",
    network: "Xem bản ghi quyết toán và sao kê ví để kiểm tra số tiền thưởng mạng lưới và trạng thái chi trả.", records: "Xem bản ghi quyết toán và sao kê ví để kiểm tra số tiền thưởng và trạng thái chi trả.", cultivation: "Xem bản ghi thưởng phát triển để kiểm tra người nhận và số tiền đã nhận.",
    exampleScope: "Các số tiền chỉ để minh họa, không phải thu nhập cá nhân. Cơ sở đơn hàng giả định:", exampleNetwork: "Minh họa thưởng mạng lưới", exampleCultivation: "Minh họa thưởng phát triển, không phải khoản cá nhân đã nhận",
    noTotal: "Không phải tổng thu nhập", pendingAmount: "Cần quyết toán", unknownAmount: "—", base: "Cơ sở đơn hàng giả định", configured: "Mức thưởng theo quy tắc", notOpen: "Chưa mở", notConfigured: "Tạm thời chưa khả dụng",
    purchase: "Mua trực tiếp", deviceEarning: "Thu nhập thiết bị trực tiếp", totalRate: "Tổng thưởng", split: "Phân chia thưởng", directOnly: "Chỉ thành viên được mời trực tiếp; nền tảng trả thêm, thành viên giữ nguyên thu nhập", priceUnavailable: "Giá NEX chưa khả dụng; đang chờ giá hợp lệ",
  },
};

export const COMMISSIONS_HOW_SLOTS = ["hero", "overview", "channels", "network", "binary", "peer", "cultivation", "leadership", "genesis", "lifecycle", "cooling", "unlocked", "withdrawn", "cooling-note", "example", "example-day", "example-network", "example-cultivation", "example-peer", "example-leadership", "example-total", "example-note", "faq", "faq-order", "faq-withdraw", "faq-reversal", "faq-cultivation", "footer"];


export function buildCommissionsHowContent(snapshot: CommissionsHowSnapshot | null, locale: string) {
  const language = locale.split("-")[0] as keyof typeof COPY;
  const copy = COPY[language] ?? COPY.en;
  const number = (value: number) => formatHowNumber(value, locale);
  const money = (value: number, currency = "USDT") => `${number(value)} ${currency}`;
  const tokens: Record<string, string> = {};
  const publicBodies: Record<string, string> = {};
  const amounts = { network: copy.unknownAmount, cultivation: copy.unknownAmount, peer: copy.unknownAmount, leadership: copy.unknownAmount };
  if (snapshot) {
    const { guide, directPolicy } = snapshot;
    const ranks = snapshot.ranks.filter(r => r.visible).sort((a, b) => a.v - b.v);
    const b = guide.binary, l = guide.leadership;
    const describe = (rule: DirectReferralRule) => !directPolicy.configured ? copy.notConfigured : !rule.enabled ? copy.paused
      : `${copy.totalRate} ${number(rule.totalRatePct)}% · ${copy.split}: USDT ${number(rule.usdtSharePct)}% / NEX ${number(100 - rule.usdtSharePct)}% · ${number(rule.coolingDays)} ${copy.days}`;
    tokens.directPurchaseRules = describe(directPolicy.purchase);
    if (directPolicy.settlementMode === "SEVEN_V2") {
      const split = directPolicy.purchaseSplit, reference = directPolicy.sevenLayerReference;
      tokens.directPurchaseRules = !directPolicy.configured || !split || !reference || directPolicy.purchaseSplitConfigured === false
        || reference.baseRatePct === null || reference.coolingDays === null ? copy.notConfigured
        : split.enabled ? `${copy.purchaseBudget} ${number(reference.baseRatePct)}% · ${copy.split}: USDT ${number(split.usdtSharePct)}% / NEX ${number(100 - split.usdtSharePct)}% · ${copy.purchaseReplacement}`
        : copy.purchaseOriginal;
    }
    tokens.networkPurchaseRules = copy.networkPurchase;
    tokens.directDeviceRules = describe(directPolicy.deviceEarning);
    tokens.directScope = directPolicy.settlementMode === "SEVEN_V2" ? copy.deviceScope : copy.directOnly;
    tokens.directPrice = directPolicy.nexUsdtPrice === null ? copy.priceUnavailable : `${money(directPolicy.nexUsdtPrice)} / NEX`;
    tokens.coolingDays = guide.coolingDays === null ? copy.missing : `${number(guide.coolingDays)} ${copy.days}`;
    tokens.binaryRules = b ? `${copy.dailyCap} ${money(b.dailyCap)} · ${copy.settlementPeriod}: ${copy[b.settlePeriod]} · ${copy.residualHandling}: ${copy[b.residualPolicy]} · ${b.paused ? copy.paused : copy.unpaused}` : copy.missing;
    tokens.peerRules = copy.records;
    tokens.cultivationRules = copy.cultivation;
    tokens.leadershipRules = l ? `${copy.minRank} V${l.minRank} · ${copy.monthlyCap} ${money(l.monthlyCap)}` : copy.hold;
    tokens.leadershipVotes = "";
    tokens.peerStatus = guide.capabilities.peer ? copy.supported : copy.unsupported;
    tokens.genesisStatus = guide.capabilities.genesis ? copy.supported : copy.unsupported;
    // A unit illustration, not a purchase, account estimate, or settlement: no fictional named orders.
    tokens.exampleBase = money(100);
    amounts.network = directPolicy.configured && directPolicy.purchase.enabled && directPolicy.nexUsdtPrice !== null ? copy.pendingAmount : copy.notConfigured;
    const cultivation = ranks.find(r => r.cultivationBonus > 0);
    tokens.exampleRank = cultivation ? `V${cultivation.v}` : copy.none;
    amounts.cultivation = cultivation ? `${money(cultivation.cultivationBonus, "NEX")} (${copy.configured})` : copy.none;
    amounts.peer = guide.capabilities.peer ? copy.pendingAmount : copy.notOpen;
    amounts.leadership = l ? copy.pendingAmount : copy.notConfigured;
    Object.assign(publicBodies, {
      binary: `${copy.records} ${tokens.binaryRules}`,
      peer: `${copy.records} ${tokens.peerStatus}`,
      cultivation: copy.cultivation,
      leadership: `${copy.records} ${tokens.leadershipRules}`,
      "example-day": `${copy.exampleScope} ${tokens.exampleBase}`,
      "example-network": copy.exampleNetwork,
      "example-cultivation": copy.exampleCultivation,
      "example-leadership": copy.pendingAmount,
    });
  }
  // The template must match the actual settlement generation, including both purchase groups.
  const directBody = snapshot?.document.blocks.find(block => block.id === "network")?.body ?? "";
  const currentPublication = directBody.includes("{directPurchaseRules}") && directBody.includes("{directDeviceRules}")
    && (snapshot?.directPolicy.settlementMode !== "SEVEN_V2" || (snapshot.document.schemaVersion === 2
      && snapshot.document.templateId === "commissions-v2" && directBody.includes("{networkPurchaseRules}")));
  const blocks = new Map(currentPublication ? snapshot?.document.blocks.map(block => [block.id, block]) : []);
  function section(id: string, fallbackTitle = copy.unavailable) {
    const block = blocks.get(id);
    let available = Boolean(block);
    const render = (raw: string) => {
      return raw.replace(/\{([^{}]+)\}/g, (_, key: string) => {
      if (!Object.prototype.hasOwnProperty.call(tokens, key)) { available = false; return ""; }
      return tokens[key];
      });
    };
    const title = block ? render(block.title) : fallbackTitle;
    const body = block ? render(block.body) : copy.unavailable;
    return { id, available, title: available ? title.trim() : fallbackTitle, body: available ? (publicBodies[id] ?? body).trim() : copy.unavailable };
  }
  const incomplete = COMMISSIONS_HOW_SLOTS.some(id => !section(id).available);
  // Never show a numeric illustration without its published context and limitations.
  if (incomplete) for (const key of Object.keys(amounts) as (keyof typeof amounts)[]) amounts[key] = copy.unknownAmount;
  return { copy, section, amounts, exampleTotal: copy.noTotal, incomplete };
}

export interface CommissionsHowState { loading: boolean; error: boolean; snapshot: CommissionsHowSnapshot | null }
export function createCommissionsHowResource(deps: { read(locale: string): Promise<CommissionsHowSnapshot>; apply(state: CommissionsHowState): void }) {
  let epoch = 0, disposed = false;
  let pending: { locale: string; promise: Promise<void> } | undefined;
  function load(locale: string): Promise<void> {
    if (disposed) return Promise.resolve();
    if (pending?.locale === locale) return pending.promise;
    const request = ++epoch;
    deps.apply({ loading: true, error: false, snapshot: null });
    const promise = Promise.resolve().then(() => deps.read(locale))
      .then(snapshot => { if (!disposed && epoch === request) deps.apply({ loading: false, error: false, snapshot }); })
      .catch(() => { if (!disposed && epoch === request) deps.apply({ loading: false, error: true, snapshot: null }); })
      .finally(() => { if (epoch === request) pending = undefined; });
    pending = { locale, promise };
    return promise;
  }
  return { load, dispose() { disposed = true; epoch++; pending = undefined; } };
}
