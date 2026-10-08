import { createAccountApi } from "./account-api";
import { createUniHttpTransport } from "./api-client";
import { createAuthApi } from "./auth-api";
import { createPaymentApi } from "./payment-api";
import { createCregisDepositApi } from "./cregis-deposit-api";
import { createProductCatalogApi } from "./product-catalog-api";
import { createProductNotificationApi } from "./product-notification-api";
import { createProductPhaseApi } from "./product-phase-api";
import { createWithdrawalApi } from "./withdrawal-api";
import { createEarnConfigApi } from "./earn-config-api";
import { createDeviceE3Api } from "./device-e3-api";
import { createOrderApi } from "./order-api";
import { createPromotionApi } from "./promotion-api";
import { createPlatformConfigApi } from "./platform-config-api";
import { createVRankApi } from "./v-rank-api";
import { createCommissionConfigApi } from "./commission-config-api";
import { createStakingApi } from "./staking-api";
import { createExchangeApi } from "./exchange-api";
import { createMarketApi } from "./market-api";
import { createGenesisApi } from "./genesis-api";
import { createRepurchaseApi } from "./repurchase-api";
import { createRiskDisclosureApi } from "./risk-disclosure-api";
import { createLegalTermsApi } from "./legal-terms-api";
import { createPrivacyPolicyApi } from "./privacy-policy-api";
import { createPayoutAddressApi } from "./payout-address-api";
import { createPaymentMethodApi } from "./payment-method-api";
import { createTrialApi } from "./trial-api";
import { createQuestApi } from "./quest-api";
import { createEventsApi } from "./events-api";
import { createPointsApi } from "./points-api";
import { createVoucherApi } from "./voucher-api";
import { createContentCopyApi } from "./content-copy-api";
import { createNotificationApi } from "./notification-api";
import { createNotificationPreferencesApi } from "./notification-preferences-api";
import { createTrustSectionApi } from "./trust-section-api";
import { createI18nApi } from "./i18n-api";
import { createJanusApi } from "./janus-api";
import { createBehaviorAnalyticsApi } from "./behavior-analytics-api";
import { createEarningsReleaseApi } from "./earnings-release-api";
import { createTaskAssignmentApi } from "./task-assignment-api";
import { createReferralRewardApi } from "./referral-reward-api";
import { createSupportApi } from "./support-api";
import { renewAppConversationRealtime, withConversationRealtime } from "./app-conversation-realtime";
import { createProfileApi } from "./profile-api";
import { createNovaAiApi } from "./nova-ai-api";
import { createComputeShareApi } from "./compute-share-api";
import { createNetworkRegionsApi } from "./network-regions-api";
import { createTeamNetworkApi } from "./team-network-api";
import { createDeveloperAccessApi } from "./developer-access-api";
import { createDeveloperResourcesApi } from "./developer-resources-api";
import { createBundleOrderApi } from "./bundle-order-api";
import { createBundleDiscountApi } from "./bundle-discount-api";
import { createAmbassadorApplicationApi } from "./ambassador-application-api";
import { createTeamInsightsApi } from "./team-insights-api";
import { createWalletBillsApi } from "./wallet-bills-api";
import { createStorefrontActivityApi } from "./storefront-activity-api";
import { createGenesisPointsApi } from "./genesis-points-api";
import { createNetworkRankApi } from "./network-rank-api";
import { createTeamQuotaApi } from "./team-quota-api";
import { createProofApi } from "./proof-api";
import { createAppHomeApi } from "./app-home-api";
import { createOnboardingCalibrationApi } from "./onboarding-calibration-api";
import { createShareEventApi } from "./share-event-api";
import { createGoalsApi } from "./goals-api";
import { createHowContentApi } from "./how-content-api";
import { createPurchaseEligibilityApi } from "./purchase-eligibility-api";
import { createH3ObservationApi } from "./h3-observation-api";
import { createDayOnePageObservationApi } from "./day-one-page-observation-api";
import { readApiRuntimeConfig, type ApiEnvironment } from "./runtime-config";
import { createRuntimeApiClient } from "./runtime-client";
import { createRuntimeSessionVault } from "./session-vault";
import type { RefreshCredentialMode } from "./session-vault";
import { createNativeSessionStorage, type NativeSessionStorage } from "./native-session-storage";
import { getDeviceId } from "@/lib/device-id";

export const apiRuntimeConfig = readApiRuntimeConfig();
export const expectedApiEnvironment: ApiEnvironment = apiRuntimeConfig.environment;
export const remoteApiEnabled = true;
// The formal App uses the Java service's canonical development contract in
// both dev and prod builds. No browser-side Sandbox rail remains deployable.
// Provider-backed card controls stay hidden until a real provider is enabled.
export const developmentPaymentEnabled = false;
export const fundsServerEnabled = true;
// Payout addresses are server-owned in both dev and prod.
export const payoutAddressServerEnabled = true;
export const payoutAddressMockEnabled = false;
let refreshCredentialMode: RefreshCredentialMode = "token";
// #ifdef H5
refreshCredentialMode = "cookie";
// #endif
export const h5RefreshCookieEnabled = refreshCredentialMode === "cookie";
let nativeSessionStorage: NativeSessionStorage | undefined;
// #ifdef APP-PLUS
if (!h5RefreshCookieEnabled) {
  nativeSessionStorage = createNativeSessionStorage({ baseUrl: apiRuntimeConfig.baseUrl, installationId: getDeviceId });
}
// #endif
export const sessionVault = createRuntimeSessionVault(nativeSessionStorage);
export async function prepareSessionVault(): Promise<void> {
  if (!nativeSessionStorage) return;
  await nativeSessionStorage.ready();
  sessionVault.hydrate();
}
let clientSurface: "APP" | undefined;
// #ifdef APP-PLUS
clientSurface = "APP";
// #endif
export const serverSessionRestoreEnabled = h5RefreshCookieEnabled || !!nativeSessionStorage;
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
  onSessionRefreshed: renewAppConversationRealtime,
  refreshCredentialMode,
});
// Authentication is server-backed in both dev and prod; Java active profile
// selects the development challenge or production provider flow.
export const authApi = createAuthApi(apiClient, sessionVault, { refreshCredentialMode, clientSurface });
export const accountApi = createAccountApi(apiClient);
export const paymentApi = createPaymentApi(apiClient, expectedApiEnvironment);
export const cregisDepositApi = createCregisDepositApi(apiClient);
export const productCatalogApi = createProductCatalogApi(apiClient);
export const productNotificationApi = createProductNotificationApi(apiClient, expectedApiEnvironment);
export const productPhaseApi = createProductPhaseApi(apiClient);
export const purchaseEligibilityApi = createPurchaseEligibilityApi(apiClient, expectedApiEnvironment);
export const h3ObservationApi = createH3ObservationApi(apiClient);
export const dayOnePageObservationApi = createDayOnePageObservationApi(apiClient);
export const withdrawalApi = createWithdrawalApi(apiClient);
export const earnConfigApi = createEarnConfigApi(apiClient);
export const deviceE3Api = createDeviceE3Api(apiClient, expectedApiEnvironment);
export const orderApi = createOrderApi(apiClient, expectedApiEnvironment);
export const platformConfigApi = createPlatformConfigApi(apiClient, expectedApiEnvironment);
export const vRankApi = createVRankApi(apiClient, expectedApiEnvironment);
export const commissionConfigApi = createCommissionConfigApi(apiClient, expectedApiEnvironment);
export const stakingApi = createStakingApi(apiClient, expectedApiEnvironment);
export const exchangeApi = createExchangeApi(apiClient, expectedApiEnvironment);
export const marketApi = createMarketApi(apiClient, expectedApiEnvironment);
export const genesisApi = createGenesisApi(apiClient, expectedApiEnvironment);
export const repurchaseApi = createRepurchaseApi(apiClient, expectedApiEnvironment);
export const riskDisclosureApi = createRiskDisclosureApi(apiClient);
export const legalTermsApi = createLegalTermsApi(apiClient);
export const payoutAddressApi = createPayoutAddressApi(apiClient, expectedApiEnvironment);
export const paymentMethodApi = createPaymentMethodApi(apiClient);
export const trialApi = createTrialApi(apiClient);
export const questApi = createQuestApi(apiClient, expectedApiEnvironment);
export const eventsApi = createEventsApi(apiClient);
export const pointsApi = createPointsApi(apiClient, expectedApiEnvironment);
export const voucherApi = createVoucherApi(apiClient, expectedApiEnvironment);
export const contentCopyApi = createContentCopyApi(apiClient);
export const notificationApi = createNotificationApi(apiClient);
export const notificationPreferencesApi = createNotificationPreferencesApi(apiClient);
export const trustSectionApi = createTrustSectionApi(apiClient, expectedApiEnvironment);
export const i18nApi = createI18nApi(apiClient);
export const janusApi = createJanusApi(apiClient);
export const behaviorAnalyticsApi = createBehaviorAnalyticsApi(apiClient);
export const earningsReleaseApi = createEarningsReleaseApi(apiClient);
export const taskAssignmentApi = createTaskAssignmentApi(apiClient, expectedApiEnvironment);
export const referralRewardApi = createReferralRewardApi(apiClient, expectedApiEnvironment);
export const supportApi = createSupportApi(withConversationRealtime(apiClient));
export const profileApi = createProfileApi(apiClient);
export const novaAiApi = createNovaAiApi(apiClient);
export const computeShareApi = createComputeShareApi(apiClient);
export const networkRegionsApi = createNetworkRegionsApi(apiClient);
export const teamNetworkApi = createTeamNetworkApi(apiClient, expectedApiEnvironment);
export const developerAccessApi = createDeveloperAccessApi(apiClient, expectedApiEnvironment);
export const developerResourcesApi = createDeveloperResourcesApi(apiClient, expectedApiEnvironment);
export const bundleOrderApi = createBundleOrderApi(apiClient);
export const promotionApi = createPromotionApi(apiClient);
export const bundleDiscountApi = createBundleDiscountApi(apiClient);
export const ambassadorApplicationApi = createAmbassadorApplicationApi(
  apiClient, "PRODUCTION",
);
export const teamInsightsApi = createTeamInsightsApi(apiClient, expectedApiEnvironment);
export const walletBillsApi = createWalletBillsApi(apiClient);
export const storefrontActivityApi = createStorefrontActivityApi(apiClient, expectedApiEnvironment);
export const genesisPointsApi = createGenesisPointsApi(apiClient, expectedApiEnvironment);
export const networkRankApi = createNetworkRankApi(apiClient, expectedApiEnvironment);
export const teamQuotaApi = createTeamQuotaApi(apiClient, expectedApiEnvironment);
export const proofApi = createProofApi(apiClient, expectedApiEnvironment);
export const appHomeApi = createAppHomeApi(apiClient, expectedApiEnvironment);
export const onboardingCalibrationApi = createOnboardingCalibrationApi(
  apiClient, "PRODUCTION",
);
export const shareEventApi = createShareEventApi(apiClient, expectedApiEnvironment);
export const goalsApi = createGoalsApi(apiClient, expectedApiEnvironment);
export const howContentApi = createHowContentApi(apiClient, expectedApiEnvironment);
export const privacyPolicyApi = createPrivacyPolicyApi(apiClient, expectedApiEnvironment);

export function setRemoteUnauthorizedHandler(handler: (() => void | Promise<void>) | undefined): void {
  unauthorizedHandler = handler;
}
