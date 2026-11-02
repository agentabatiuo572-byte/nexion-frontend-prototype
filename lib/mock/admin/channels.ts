/**
 * 全站唯一充值通道枚举(PAY 规格 [FEAT-PAY01]③,2026-07 签字;前后台单源)。
 * 消费面:D1 渠道配置/对账(d-tabs)、C1 投入卡 channel(user-deposits)、D1 充值流水(design-data.TOPUPS)。
 * BTC/ETH 已下线(PAY §7 #1/#3);提现网络 = USDT 三网络。
 * backend-replaceable:GET /api/admin/channels(费率/最低额/上限/启停均后台 D1 可配,client 拉取失败禁回退写死值)。
 */
export type ChannelId = "usdt-trc20" | "usdt-bep20" | "usdt-erc20" | "bank-vietqr" | "card-intl";

export interface ChannelSpec {
  id: ChannelId; // canonical 枚举值(运营面作小号 mono 副标)
  name: string; // 运营可读中文主标
  fee: string;
  min: string;
  cap: string | null; // 单笔上限(仅银行轨)
  on: boolean;
}

export const CHANNELS: ChannelSpec[] = [
  { id: "usdt-trc20", name: "USDT-TRC20 链上", fee: "1 USDT 固定", min: "$10", cap: null, on: true },
  { id: "usdt-bep20", name: "USDT-BEP20 链上", fee: "1 USDT 固定", min: "$10", cap: null, on: true },
  { id: "usdt-erc20", name: "USDT-ERC20 链上", fee: "5 USDT 固定", min: "$10", cap: null, on: true },
  { id: "bank-vietqr", name: "银行转账 VietQR", fee: "0(平台不收)", min: "$10 等值", cap: "$5,000", on: true },
  { id: "card-intl", name: "国际卡", fee: "3.5% · 进风控备付金", min: "$30", cap: "$5,000", on: true },
];

export const channelName = (id: string) => CHANNELS.find((c) => c.id === id)?.name ?? id;

/** 卡通道费率 —— 运营面文案禁自己手打百分号(D1 对账页曾两处写死 3.5%,调费率不跟)。
 *  从 CHANNELS 这个既有单源派生,不另立常量:多一个常量就多一条能漂移的线,
 *  而这条串已被 scripts/channel-parity-sentinel.mjs 逐值钉住 uniapp 的 CARD_FEE_RATE。
 *  (更干净的做法是把 fee 拆成数值 + 展示串两字段,但那要改 ChannelSpec 与哨兵正则,
 *   收益不抵风险 —— 真要重构时一起做。) */
export const cardFeePct = (): string =>
  CHANNELS.find((c) => c.id === "card-intl")?.fee.match(/[\d.]+%/)?.[0] ?? "";

export const cardFeeRate = (): number => (parseFloat(cardFeePct()) || 0) / 100;

/** 提现可选网络(PAY §7 #3:仅 USDT 三网络,BTC/ETH 下线)。 */
export const WITHDRAW_NETWORKS = ["USDT-TRC20", "USDT-ERC20", "USDT-BEP20"] as const;
