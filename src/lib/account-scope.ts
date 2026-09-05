import { useRiskDisclosure } from "@/store/risk-disclosure";
import { useGenesis } from "@/store/genesis";
import { useVRank } from "@/store/v-rank";
import { useOrders } from "@/store/orders";
import { useBills } from "@/store/bills";
import { useDeposits } from "@/store/deposits";
import { useStaking } from "@/store/staking";
import { useCommission } from "@/store/commission";
import { useVoucher } from "@/store/voucher";
import { useFreeTrial } from "@/store/free-trial";
import { useExchange } from "@/store/exchange";
import { useExchangeV3 } from "@/store/exchange-v3";
import { useCards } from "@/store/cards";
import { useNexFaucet } from "@/store/nex-faucet";
import { usePayoutAddress } from "@/store/payout-address";
import { useQuest } from "@/store/quest";
import { useWeeklyQuest } from "@/store/weekly-quest";
import { useEventQuest } from "@/store/event-quest";
import { useMilestones } from "@/store/milestones";
import { useAchievements } from "@/store/achievements";
import { useGoals } from "@/store/goals";
import { useLuckySpin } from "@/store/lucky-spin";
import { useDailyPowerUp } from "@/store/daily-powerup";
import { useNotifications } from "@/store/notifications";
import { useReceipts } from "@/store/receipts";
import { useTickets } from "@/store/tickets";
import { useCart } from "@/store/cart";
import { usePendingCheckout } from "@/store/pending-checkout";
import { useProfile } from "@/store/profile";
import { useSecurity } from "@/store/security";
import { useRewardsSeen } from "@/store/rewards-seen";
import { useSponsorship } from "@/store/sponsorship";
import { useConversations } from "@/store/conversations";
import { useNova } from "@/store/nova";
import { useRankSnapshot } from "@/store/rank-snapshot";
import { useGenesisPoints } from "@/store/genesis-points";
import { useNetworkRank } from "@/store/network-rank";
import { bindEarningsReleaseAccount } from "@/store/earning-release";
import { useReferralReward } from "@/store/referral-reward";
import { useRepurchase } from "@/store/repurchase";
import { useNetwork } from "@/store/network";
import { prepareProductCatalog } from "@/store/product-catalog";
import { prepareServerProductPhase } from "@/store/server-product-phase";
import { purchaseEligibilityStore } from "@/store/purchase-eligibility";
import { useTradeinSheet } from "@/store/tradein-sheet";
import { useContentCopy } from "@/store/content-copy";
import { remoteAccountScope, type RemoteAccountRequest } from "@/lib/remote-account-epoch";

/** Snapshot the account generation before starting an account-sensitive request. */
export function captureAccountScope(): RemoteAccountRequest {
  return remoteAccountScope.snapshot();
}

/** Reject a response after a rebind, including a same-account rebind. */
export function isCurrentAccountScope(request: RemoteAccountRequest): boolean {
  return remoteAccountScope.isCurrent(request);
}

/**
 * 账号切换收口:所有 per-account store 在此统一重绑,账号切换互不继承(P2-8 存储
 * 作用域债修复)。`app.bindAccount` 的三个调用点(App.vue 启动恢复 / login / register)
 * 紧随其后调用本函数;编排放 lib 层不进 app store(P-031/032: stores never import each other)。
 * 再把设备级 store 改成按账号隔离时,在此挂接一行即可,三个调用点自动继承。
 *
 * 已收口(用户资产,随账号走):
 *  批1 钱类:创世持仓 · V 等级 · 订单 · 账单 · 入金记录/意向单 · 质押持仓 · 佣金事件
 *  批2 券/试用/兑换:券包 · 试用状态机 · swap 记录 · 兑换风控计数(日限) · 绑卡 · 签到状态机 · 提现地址簿(包 E 地址直管)
 *  批3 任务/成就/游戏化:任务完成 · 周任务 · 活动任务 · 里程碑 fired · 成就 · 目标 · 幸运转盘票据 · 每日增益
 *  批4 记录/账户:通知 feed · 算力凭证 · 工单 · 购物车 · 资料 · 安全设置 · 奖励已读水位线
 *  批5 会话记录:会话中心(advisor/support) · Nova 记录 — 非持久,换号 = reset 重播种
 * 顺带保留设备级(平台态/设备偏好,不迁):主题 · 语言 · preferences · auth 登录态 ·
 * session · risk-cluster · risk-identity · earning-release(以 accountKey 为参的注册表,已按账号)·
 * product-phase · trial-config · genesis-config(运营镜像)。
 * sponsorship 的推荐归因也按账号重绑，避免同设备不同账号串展示/串礼。
 */
export function rebindAccountScopedStores(accountKey: string): void {
  remoteAccountScope.bind(accountKey);
  // Server-authoritative financial buckets are never shared across accounts;
  // the successful sign-in flow refreshes this cleared slot immediately.
  prepareProductCatalog();
  prepareServerProductPhase();
  // Eligibility snapshots are server decisions scoped to the active account;
  // clear them before any next-account commerce request can start.
  purchaseEligibilityStore.clear();
  useTradeinSheet().clearApplied();
  useTradeinSheet().hide();
  useContentCopy().clear();
  bindEarningsReleaseAccount(accountKey);
  useRiskDisclosure().bindAccount();
  useGenesis().bindAccount(accountKey);
  useVRank().bindAccount(accountKey);
  useOrders().bindAccount(accountKey);
  useBills().bindAccount(accountKey);
  useDeposits().bindAccount(accountKey);
  useStaking().bindAccount(accountKey);
  useCommission().bindAccount(accountKey);
  useVoucher().bindAccount(accountKey);
  useFreeTrial().bindAccount(accountKey);
  useExchange().bindAccount(accountKey);
  useExchangeV3().bindAccount(accountKey);
  useCards().bindAccount(accountKey);
  useNexFaucet().bindAccount(accountKey);
  usePayoutAddress().bindAccount(accountKey);
  useQuest().bindAccount(accountKey);
  useWeeklyQuest().bindAccount(accountKey);
  useReferralReward().bindAccount(accountKey);
  useNetwork().bindAccount(accountKey);
  useRepurchase().bindAccount();
  useRankSnapshot().bindAccount(accountKey); // 首页排名 24h 快照:换号必换行,否则看到别人的昨日名次
  useGenesisPoints().bindAccount(accountKey);
  useNetworkRank().bindAccount(accountKey);
  useEventQuest().bindAccount(accountKey);
  useMilestones().bindAccount(accountKey);
  useAchievements().bindAccount(accountKey);
  useGoals().bindAccount(accountKey);
  useLuckySpin().bindAccount(accountKey);
  useDailyPowerUp().bindAccount(accountKey);
  useNotifications().bindAccount(accountKey);
  useReceipts().bindAccount(accountKey);
  useTickets().bindAccount(accountKey);
  useCart().bindAccount(accountKey);
  usePendingCheckout().bindAccount(accountKey); // 待支付会话(结算扫码步的发票):换号必换行
  useProfile().bindAccount(accountKey);
  useSecurity().bindAccount(accountKey);
  useSponsorship().bindAccount(accountKey);
  // 会话中心 + Nova 是非持久会话记录(无按账号存储),换号语义 = 清空重播种——
  // 防上一账号的客服对话/Nova 推送在 SPA 内切号(reLaunch 不重载文档)后被下一账号看到。
  useConversations().bindAccount(accountKey);
  useNova().reset();
  // rewards-seen 读 bills(已在上方先重绑)派生红点,故放最后。
  useRewardsSeen().bindAccount(accountKey);
}
