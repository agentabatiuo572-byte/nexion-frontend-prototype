import type { HowContentDocument } from "@/api/how-content-api";
import type { CommissionGuideRates, CommissionGuideRules } from "@/api/commission-guide-api";
import type { CanonicalVRankRow } from "@/api/v-rank-api";
import { formatHowNumber } from "./rank-how-content";

export interface CommissionsHowSnapshot { document: HowContentDocument; rates: CommissionGuideRates; guide: CommissionGuideRules; ranks: CanonicalVRankRow[] }
// Public summaries keep settlement facts without reproducing internal reward formulas.
const COPY = {
  zh: {
    loading: "正在读取最新说明与佣金规则…", unavailable: "说明或规则暂不可用，请重新加载。", missing: "未配置或配置无效，请以实际事件记录为准", none: "暂无已配置权益", retry: "重新加载",
    days: "天", dailyCap: "日封顶", settlementPeriod: "结算周期", residualHandling: "剩余业绩处理", minRank: "参与起点", monthlyCap: "月上限",
    daily: "每日", weekly: "每周", monthly: "每月", monthlyClear: "每月清零", perPairClear: "每次对碰清零", carryForward: "转结", paused: "已暂停", unpaused: "未暂停；仍须满足实际结算资格",
    hold: "领导池当前不开放结算", unsupported: "尚未开放独立佣金派发，请以实际记录为准", supported: "是否触发与到账以实际事件为准",
    network: "网络奖励的金额和到账状态以实际结算记录及钱包账单为准。", records: "奖励金额和到账状态以实际结算记录及钱包账单为准。", cultivation: "培育奖励请按实际奖励记录核对接收人和到账金额。",
    exampleScope: "以下金额仅作算例，不代表个人收益。假设订单基数：", exampleNetwork: "网络奖励算例", exampleCultivation: "培育奖励算例，不代表个人到账金额",
    noTotal: "非实际收益合计", pendingAmount: "需实际结算", unknownAmount: "—", base: "假设订单基数", configured: "配置额", notOpen: "未开放", notConfigured: "未配置",
  },
  en: {
    loading: "Loading the latest explanation and commission rules…", unavailable: "Explanation or rules unavailable. Please reload.", missing: "Missing or invalid configuration; check actual event records", none: "No configured benefits", retry: "Reload",
    days: "days", dailyCap: "daily cap", settlementPeriod: "Settlement period", residualHandling: "Remaining volume handling", minRank: "entry rank", monthlyCap: "monthly cap",
    daily: "daily", weekly: "weekly", monthly: "monthly", monthlyClear: "monthly reset", perPairClear: "reset per match", carryForward: "carry forward", paused: "paused", unpaused: "not paused; actual settlement eligibility still applies",
    hold: "Leadership pool settlement is not open", unsupported: "Independent commission payouts are not available; check actual records", supported: "Triggering and payment depend on actual events",
    network: "Check settlement records and wallet statements for network reward amounts and payment status.", records: "Check settlement records and wallet statements for reward amounts and payment status.", cultivation: "Check cultivation reward records for the recipient and amount received.",
    exampleScope: "These amounts are illustrations, not personal earnings. Hypothetical order base:", exampleNetwork: "Network reward illustration", exampleCultivation: "Cultivation reward illustration, not a personal payment",
    noTotal: "Not an earnings total", pendingAmount: "Requires settlement", unknownAmount: "—", base: "Hypothetical order base", configured: "Configured amount", notOpen: "Not available", notConfigured: "Not configured",
  },
  vi: {
    loading: "Đang tải hướng dẫn và quy tắc hoa hồng mới nhất…", unavailable: "Chưa có hướng dẫn hoặc quy tắc. Vui lòng tải lại.", missing: "Cấu hình thiếu hoặc không hợp lệ; xem bản ghi thực tế", none: "Chưa có quyền lợi được cấu hình", retry: "Tải lại",
    days: "ngày", dailyCap: "giới hạn ngày", settlementPeriod: "Chu kỳ quyết toán", residualHandling: "Xử lý doanh số còn lại", minRank: "hạng tham gia", monthlyCap: "giới hạn tháng",
    daily: "hằng ngày", weekly: "hằng tuần", monthly: "hằng tháng", monthlyClear: "xóa theo tháng", perPairClear: "xóa sau mỗi đối ứng", carryForward: "chuyển tiếp", paused: "đã tạm dừng", unpaused: "chưa tạm dừng; vẫn cần đáp ứng điều kiện quyết toán",
    hold: "Quỹ lãnh đạo hiện chưa mở quyết toán", unsupported: "Chưa mở trả hoa hồng độc lập; xem bản ghi thực tế", supported: "Phát sinh và chi trả theo sự kiện thực tế",
    network: "Xem bản ghi quyết toán và sao kê ví để kiểm tra số tiền thưởng mạng lưới và trạng thái chi trả.", records: "Xem bản ghi quyết toán và sao kê ví để kiểm tra số tiền thưởng và trạng thái chi trả.", cultivation: "Xem bản ghi thưởng phát triển để kiểm tra người nhận và số tiền đã nhận.",
    exampleScope: "Các số tiền chỉ để minh họa, không phải thu nhập cá nhân. Cơ sở đơn hàng giả định:", exampleNetwork: "Minh họa thưởng mạng lưới", exampleCultivation: "Minh họa thưởng phát triển, không phải khoản cá nhân đã nhận",
    noTotal: "Không phải tổng thu nhập", pendingAmount: "Cần quyết toán", unknownAmount: "—", base: "Cơ sở đơn hàng giả định", configured: "Số tiền cấu hình", notOpen: "Chưa mở", notConfigured: "Chưa cấu hình",
  },
};

export const COMMISSIONS_HOW_SLOTS = ["hero", "overview", "channels", "network", "binary", "peer", "cultivation", "leadership", "genesis", "lifecycle", "cooling", "unlocked", "withdrawn", "cooling-note", "example", "example-day", "example-network", "example-cultivation", "example-peer", "example-leadership", "example-total", "example-note", "faq", "faq-order", "faq-withdraw", "faq-reversal", "faq-cultivation", "footer"];

// Decimal multiplication of the validated non-negative inputs. Integer division implements
// six-place HALF_UP without binary floating-point epsilon or invented precision.
function exampleMultiply(a: number, b: number): number | null {
  const decimal = (value: number) => {
    const [mantissa, exponent = "0"] = String(value).split("e");
    const [whole, fraction = ""] = mantissa.split(".");
    return { digits: BigInt(whole + fraction), scale: fraction.length - Number(exponent) };
  };
  const left = decimal(a), right = decimal(b), shift = 6 - left.scale - right.scale;
  let micros = left.digits * right.digits;
  if (shift >= 0) micros *= BigInt(10) ** BigInt(shift);
  else {
    const divisor = BigInt(10) ** BigInt(-shift);
    micros = (micros * BigInt(2) + divisor) / (divisor * BigInt(2));
  }
  return micros <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(micros) / 1e6 : null;
}

export function buildCommissionsHowContent(snapshot: CommissionsHowSnapshot | null, locale: string) {
  const language = locale.split("-")[0] as keyof typeof COPY;
  const copy = COPY[language] ?? COPY.en;
  const number = (value: number) => formatHowNumber(value, locale);
  const money = (value: number, currency = "USDT") => `${number(value)} ${currency}`;
  const tokens: Record<string, string> = {};
  const publicBodies: Record<string, string> = {};
  const amounts = { network: copy.unknownAmount, cultivation: copy.unknownAmount, peer: copy.unknownAmount, leadership: copy.unknownAmount };
  if (snapshot) {
    const { guide, rates } = snapshot;
    const ranks = snapshot.ranks.filter(r => r.visible).sort((a, b) => a.v - b.v);
    const b = guide.binary, l = guide.leadership;
    tokens.networkRates = copy.network;
    tokens.networkNex = copy.network;
    tokens.networkGate = "";
    tokens.exitCap = "";
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
    const rate = rates.unilevelUsdt[1];
    const nexFactor = rates.unilevelNex[1];
    if (rate !== undefined && nexFactor !== undefined) {
      const usdt = exampleMultiply(100, rate);
      const nex = usdt === null ? null : exampleMultiply(usdt, nexFactor);
      if (usdt !== null && nex !== null) amounts.network = `${money(usdt)} + ${money(nex, "NEX")}`;
    }
    const cultivation = ranks.find(r => r.cultivationBonus > 0);
    tokens.exampleRank = cultivation ? `V${cultivation.v}` : copy.none;
    amounts.cultivation = cultivation ? `${money(cultivation.cultivationBonus, "NEX")} (${copy.configured})` : copy.none;
    amounts.peer = guide.capabilities.peer ? copy.pendingAmount : copy.notOpen;
    amounts.leadership = l ? copy.pendingAmount : copy.notConfigured;
    Object.assign(publicBodies, {
      network: copy.network,
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
  const blocks = new Map(snapshot?.document.blocks.map(block => [block.id, block]));
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
