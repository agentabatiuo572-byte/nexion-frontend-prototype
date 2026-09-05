import { createAccountApi } from "./account-api";
import { createUniHttpTransport } from "./api-client";
import { createMockAuthApi } from "./mock-auth-api";
import type { AuthApi } from "./auth-api";
import { createPaymentApi } from "./payment-api";
import { createProductCatalogApi } from "./product-catalog-api";
import { createProductPhaseApi } from "./product-phase-api";
import { createWithdrawalApi } from "./withdrawal-api";
import { createEarnConfigApi } from "./earn-config-api";
import { createDeviceE3Api } from "./device-e3-api";
import { createOrderApi } from "./order-api";
import { createPlatformConfigApi } from "./platform-config-api";
import { createVRankApi } from "./v-rank-api";
import { createCommissionConfigApi } from "./commission-config-api";
import { createStakingApi } from "./staking-api";
import { createExchangeApi } from "./exchange-api";
import { createMarketApi } from "./market-api";
import { createGenesisApi } from "./genesis-api";
import { createRepurchaseApi } from "./repurchase-api";
import { createRiskDisclosureApi } from "./risk-disclosure-api";
import { createPayoutAddressApi } from "./payout-address-api";
import { createPaymentMethodApi } from "./payment-method-api";
import { createTrialApi } from "./trial-api";
import { createQuestApi } from "./quest-api";
import { createEventsApi } from "./events-api";
import { createPointsApi } from "./points-api";
import { createVoucherApi } from "./voucher-api";
import { createContentCopyApi } from "./content-copy-api";
import { createNotificationApi } from "./notification-api";
import { createTrustSectionApi } from "./trust-section-api";
import { createI18nApi } from "./i18n-api";
import { createJanusApi } from "./janus-api";
import { createBehaviorAnalyticsApi } from "./behavior-analytics-api";
import { createEarningsReleaseApi } from "./earnings-release-api";
import { createTaskAssignmentApi } from "./task-assignment-api";
import { createFundsSandboxApi } from "./funds-sandbox-api";
import { createReferralRewardApi } from "./referral-reward-api";
import { createSupportApi } from "./support-api";
import { createProfileApi } from "./profile-api";
import { createNovaAiApi } from "./nova-ai-api";
import { createComputeShareApi } from "./compute-share-api";
import { createNetworkRegionsApi } from "./network-regions-api";
import { createTeamNetworkApi } from "./team-network-api";
import { createDeveloperAccessApi } from "./developer-access-api";
import { createBundleOrderApi } from "./bundle-order-api";
import { createCommercePaymentApi } from "./commerce-payment-api";
import { createAmbassadorApplicationApi } from "./ambassador-application-api";
import { createTeamInsightsApi } from "./team-insights-api";
import { createWalletBillsApi } from "./wallet-bills-api";
import { createStorefrontActivityApi } from "./storefront-activity-api";
import { createGenesisPointsApi } from "./genesis-points-api";
import { createNetworkRankApi } from "./network-rank-api";
import { createTeamQuotaApi } from "./team-quota-api";
import { createProofApi } from "./proof-api";
import { createAppHomeApi } from "./app-home-api";
import { createPurchaseEligibilityApi } from "./purchase-eligibility-api";
import { readApiRuntimeConfig } from "./runtime-config";
import { createRuntimeApiClient } from "./runtime-client";
import { createRuntimeSessionVault } from "./session-vault";

export const apiRuntimeConfig = readApiRuntimeConfig();
export const remoteApiEnabled = false;
export const mockFundsEnabled = false;
export const mockPaymentEnabled = true;
export const fundsServerEnabled = false;
export const payoutAddressServerEnabled = false;
export const payoutAddressMockEnabled = true;
export const sessionVault = createRuntimeSessionVault();
let unauthorizedHandler: (() => void | Promise<void>) | undefined;

function isLoopbackSameOriginPreview(baseUrl: string): boolean {
  if (typeof window === "undefined" || window.location.origin !== baseUrl) return false;
  return window.location.protocol === "http:"
    && (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" || window.location.hostname === "::1");
}

export const apiClient = createRuntimeApiClient({
  config: apiRuntimeConfig,
  transport: createUniHttpTransport(),
  vault: sessionVault,
  development: import.meta.env.DEV,
  localPreview: isLoopbackSameOriginPreview(apiRuntimeConfig.baseUrl),
  onUnauthorized: () => unauthorizedHandler?.(),
});
// Account-deletion cleanup below the mock auth module reaches stores that also
// consume runtime APIs. Constructing the adapter eagerly would therefore read
// this circular graph before module initialisation has finished. Resolve the
// single mock adapter on first use instead.
let resolvedMockAuthApi: AuthApi | null = null;
function getMockAuthApi(): AuthApi {
  resolvedMockAuthApi ??= createMockAuthApi(sessionVault);
  return resolvedMockAuthApi;
}
export const authApi = new Proxy({} as AuthApi, {
  get(_target, property) {
    const api = getMockAuthApi();
    const value = Reflect.get(api, property);
    return typeof value === "function" ? value.bind(api) : value;
  },
});
export const accountApi = createAccountApi(apiClient);
export const paymentApi = createPaymentApi(apiClient);
export const productCatalogApi = createProductCatalogApi(apiClient);
export const productPhaseApi = createProductPhaseApi(apiClient);
export const purchaseEligibilityApi = createPurchaseEligibilityApi(apiClient);
export const withdrawalApi = createWithdrawalApi(apiClient);
export const earnConfigApi = createEarnConfigApi(apiClient);
export const deviceE3Api = createDeviceE3Api(apiClient);
export const orderApi = createOrderApi(apiClient, "mock");
export const platformConfigApi = createPlatformConfigApi(apiClient, "mock");
export const vRankApi = createVRankApi(apiClient);
export const commissionConfigApi = createCommissionConfigApi(apiClient, "mock");
export const stakingApi = createStakingApi(apiClient);
export const exchangeApi = createExchangeApi(apiClient);
export const marketApi = createMarketApi(apiClient, "mock");
export const genesisApi = createGenesisApi(apiClient);
export const repurchaseApi = createRepurchaseApi(apiClient);
export const riskDisclosureApi = createRiskDisclosureApi(apiClient);
export const payoutAddressApi = createPayoutAddressApi(apiClient);
export const paymentMethodApi = createPaymentMethodApi(apiClient);
export const trialApi = createTrialApi(apiClient);
export const questApi = createQuestApi(apiClient);
export const eventsApi = createEventsApi(apiClient);
export const pointsApi = createPointsApi(apiClient);
export const voucherApi = createVoucherApi(apiClient);
export const contentCopyApi = createContentCopyApi(apiClient);
export const notificationApi = createNotificationApi(apiClient);
export const trustSectionApi = createTrustSectionApi(apiClient, "mock");
export const i18nApi = createI18nApi(apiClient);
export const janusApi = createJanusApi(apiClient);
export const behaviorAnalyticsApi = createBehaviorAnalyticsApi(apiClient);
export const earningsReleaseApi = createEarningsReleaseApi(apiClient);
export const taskAssignmentApi = createTaskAssignmentApi(apiClient);
export const fundsSandboxApi = createFundsSandboxApi(apiClient);
export const referralRewardApi = createReferralRewardApi(apiClient);
export const supportApi = createSupportApi(apiClient);
export const profileApi = createProfileApi(apiClient);
export const novaAiApi = createNovaAiApi(apiClient);
export const computeShareApi = createComputeShareApi(apiClient);
export const networkRegionsApi = createNetworkRegionsApi(apiClient);
export const teamNetworkApi = createTeamNetworkApi(apiClient);
export const developerAccessApi = createDeveloperAccessApi(apiClient);
export const bundleOrderApi = createBundleOrderApi(apiClient);
export const commercePaymentApi = createCommercePaymentApi(apiClient);
export const ambassadorApplicationApi = createAmbassadorApplicationApi(apiClient);
export const teamInsightsApi = createTeamInsightsApi(apiClient, "mock");
export const walletBillsApi = createWalletBillsApi(apiClient);
export const storefrontActivityApi = createStorefrontActivityApi(apiClient);
export const genesisPointsApi = createGenesisPointsApi(apiClient);
export const networkRankApi = createNetworkRankApi(apiClient);
export const teamQuotaApi = createTeamQuotaApi(apiClient);
export const proofApi = createProofApi(apiClient, "mock");
export const appHomeApi = createAppHomeApi(apiClient);

export function setRemoteUnauthorizedHandler(handler: (() => void | Promise<void>) | undefined): void {
  unauthorizedHandler = handler;
}
