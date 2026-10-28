#!/usr/bin/env node
// Fixture-backed browser evidence; no live payment, settlement or native-device claim.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { ensureServer, identify, normTreePath } from "./lib/dev-server-pool.mjs";
import { directAppUrl } from "./lib/direct-app-url.mjs";
import { installFormalProbeSession } from "./lib/formal-probe-session.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = path.resolve(process.env.AMOUNT_DISPLAY_REPORT || "D:/CodexData/test-environments/workflow-runs/amount-display-20261012/runtime-report.json");
const output = path.dirname(reportPath);
const smoke = process.argv.includes("--smoke");
const smokeMatrix = process.argv.includes("--smoke-matrix");
assert(!smokeMatrix || smoke, "--smoke-matrix requires --smoke");
const startedAt = new Date().toISOString();
const now = Date.now(), iso = new Date(now).toISOString();
const proof = { source: "server", sourceEnvironment: "PRODUCTION", runId: "", serverCanonical: true };
const i18n = text => ({ en: text, zh: text, vi: text });
const manifest = JSON.parse(await readFile(path.join(root, "src/pages.json"), "utf8"));
const allRoutes = [...manifest.pages, ...(manifest.subPackages || []).flatMap(group => group.pages.map(p => ({ path: `${group.root}/${p.path}` })))].map(p => p.path);
assert(allRoutes.length && new Set(allRoutes).size === allRoutes.length, "pages.json must contain distinct routes");
const anonymous = new Set(["pages/entry-surfaces/index", "pages/entry-surfaces/signed", "pages/entry-surfaces/h5", "pages/entry-surfaces/white", "pages/onboarding/intro", "pages/onboarding/terms", "pages/onboarding/privacy", "pages/register/register", "pages/login/login", "pages/session/kicked", "pages/me/risk-disclosure", "pages/ref/code", "pages/tx/hash"]);
const h5Boundaries = {
  "pages/onboarding/connect": { target: "pages/register/success", selector: ".rs-h5-download", exit: ".rs-continue", exitTarget: "pages/index/index", source: "src/pages/onboarding/connect.vue: H5 download route" },
  "pages/onboarding/estimator": { target: "pages/register/success", selector: ".rs-h5-download", exit: ".rs-continue", exitTarget: "pages/index/index", source: "src/pages/onboarding/estimator.vue: H5 download route" },
  "pages/me/wallet-cards": { target: "pages/me/wallet-cards-new", selector: ".nx-content", exit: ".spv-back", exitTarget: "pages/me/wallet", source: "src/pages/me/wallet-cards.vue: unavailable card binding adapter" },
};
const selectedItems = [{ productNo: "stellarbox-s1", quantity: 1 }];
const itemsQuery = items => encodeURIComponent(JSON.stringify(items));
const queries = {
  "pages/store/detail": "id=stellarbox-s1&activityId=money-promo",
  "pages/store/checkout": `items=${itemsQuery(selectedItems)}&activityId=money-promo`,
  "pages/store/bundle": `items=${itemsQuery([...selectedItems, { productNo: "stellarbox-pro", quantity: 1 }])}&activityId=money-promo`,
  "pages/store/order-detail": "id=NX-MONEY-ORDER",
  "pages/earn/device-detail": "id=703", "pages/me/wallet-withdraw-tracking": "id=WD-MONEY1234",
  "pages/events/promotion-reward-detail": "obligationId=money-reward-usdt",
  "pages/me/rewards-list": "cat=promotion", "pages/support/chat": "cid=UI-CV-1",
  "pages/learn/course": "id=money-course", "pages/ref/code": "code=MONEY", "pages/tx/hash": `hash=0x${"a".repeat(64)}`,
};

// Positive assertions stop an empty or failed business read from passing a formatting scan.
const keySurfaces = {
  "pages/index/index": [".home-earnings-cluster", ["50.00"]],
  "pages/earn/earn": [".earn-fleet-list", ["0.12"]],
  "pages/earn/device-detail": [".nx-device-detail__surface", ["0.12"]],
  "pages/store/store": [null, ["200.00"]],
  "pages/store/detail": ["[data-testid=detail-promotion]", ["50.12"]],
  "pages/store/checkout": [".promotion-main", ["200.00", "24.00", "176.00", "50.12"]],
  "pages/store/bundle": ["[data-testid=promotion-bundle]", ["200.00", "24.00", "176.00", "50.12"]],
  "pages/store/orders": ['[role=button][aria-label*="NX-MONEY-ORDER"]', ["176.00"]],
  "pages/store/order-detail": [null, ["176.00"]],
  "pages/me/wallet": [null, ["1234.57"]],
  "pages/me/me": [".nx-wallet-amount", ["1234.57"]],
  "pages/me/wallet-bills": [null, ["50.12"]],
  "pages/me/wallet-nex": [null, ["789.00"]],
  "pages/me/wallet-topup": [null, ["5000.00"]],
  "pages/me/wallet-withdraw": [null, ["1200.12"]],
  "pages/me/wallet-withdraw-bank": [null, ["1200.12"]],
  "pages/me/wallet-exchange": [null, ["50.12", "400.99"]],
  "pages/me/wallet-repurchase": [null, ["50.12"]],
  "pages/me/wallet-withdraw-tracking": [null, ["50.12"]],
  "pages/me/receipts": [null, ["1.23"]],
  "pages/me/rewards": [null, ["50.12"]],
  "pages/me/rewards-list": [".promotion-row", ["50.12", "789.00"]],
  "pages/events/promotion-rewards": [".promotion-row", ["50.12", "789.00"]],
  "pages/events/promotion-reward-detail": [".promotion-row", ["50.12"]],
  "pages/team/team": [".invite-card", ["50.00"]],
  "pages/team/network": [null, ["200.00"]],
  "pages/team/binary": [null, ["200.00"]],
  "pages/team/commissions": [null, ["50.12"]],
  "pages/team/unilevel": [null, ["50.12"]],
  "pages/team/leadership-pool": [null, ["1000.00"]],
  "pages/team/leaderboard": [null, ["50.12"]],
  "pages/genesis/genesis": [null, ["200.00"]],
  "pages/genesis/holder": [null, ["50.12"]],
  "pages/genesis/marketplace": [null, ["50.12"]],
  "pages/staking/staking": [null, ["50.12"]],
  "pages/me/goals": [null, ["200.00"]],
  "pages/daily/daily": [null, ["789.00"]],
  "pages/missions/missions": [null, ["50.00"]],
};
const routes = [...allRoutes];
const smokeRouteArg = process.argv.find(arg => arg.startsWith("--smoke-routes="));
if (smokeRouteArg) { assert(smoke, "--smoke-routes requires --smoke; a subset must not claim full acceptance"); routes.splice(0, routes.length, ...smokeRouteArg.slice("--smoke-routes=".length).split(",").filter(Boolean)); assert(routes.length, "Empty smoke route selection"); }
for (const route of [...routes, ...Object.keys(keySurfaces)]) assert(allRoutes.includes(route), `Assertion route is absent from pages.json: ${route}`);

const disclosure = { title: i18n("Purchase reward"), terms: i18n("The displayed reward follows the order terms."), refundTerms: i18n("A refunded purchase reverses its reward."), benefitDescription: i18n("Wallet reward"), deviceRights: null, deviceName: null };
const rewardSpec = (type, amount, id) => ({ rewardRuleId: id, beneficiaryRole: "BUYER", type, calculation: "FIXED", amount, disclosure });
const publicRewards = [rewardSpec("USDT", "50.123456", "rule-usdt"), rewardSpec("NEX", "789.000001", "rule-nex")];
const expectedRewards = publicRewards.map(reward => ({ lineId: "money-line-0", activityId: "money-promo", version: 1, ruleId: reward.rewardRuleId, rewardRuleId: reward.rewardRuleId, beneficiaryRole: "BUYER", groups: 1, reward, eligibility: "ELIGIBLE", message: null, disclosure }));
const rewards = publicRewards.map((reward, i) => ({ obligationId: `money-reward-${reward.type.toLowerCase()}`, activityId: "money-promo", version: 1, orderNo: "NX-MONEY-ORDER", orderLineId: "money-line-0", ruleId: reward.rewardRuleId, rewardRuleId: reward.rewardRuleId, unitSeq: i + 1, beneficiaryRole: "BUYER", reward, state: "ISSUED", revision: 1, refundHold: false, refundRequestIds: [], assetReceipt: { ledgerBizNo: `MONEY-LEDGER-${i}`, earningsEntryNo: `MONEY-EARNING-${i}`, deviceIds: [], instanceNos: [], source: "PROMOTION_REWARD", issuedAt: iso }, recoveredAmount: null, recoveryOutstanding: null, commandId: null, updatedAt: iso, disclosure }));
const promotion = { activityId: "money-promo", version: 1, template: "MULTI_PRODUCT", state: "ACTIVE", startsAt: new Date(now - 86400000).toISOString(), endsAt: new Date(now + 86400000).toISOString(), serverTime: iso, title: i18n("Purchase rewards"), terms: i18n("Review the purchase amount and reward before confirming."), placement: "home.purchase-promotion", target: "STORE", productNos: ["stellarbox-s1", "stellarbox-pro"], minimumClientCapabilities: ["PROMOTION_QUOTE_V1", "ORDER_ITEM_QUANTITIES_V1", "PROMOTION_REWARDS_V1"], eligibility: "ESTIMATE_ELIGIBLE", eligibilityMessage: null, rewardRules: publicRewards.map(reward => ({ ruleId: reward.rewardRuleId, productNo: "stellarbox-s1", minBuyQty: 1, repeatMode: "ONCE_PER_ORDER", maxGroups: { mode: "UNLIMITED" }, maxGroupsPerPerson: { mode: "UNLIMITED" }, buyerReward: reward, inviterReward: null })) };
function quote(items = selectedItems) {
  return { quoteId: "money-quote", quoteHash: "a".repeat(64), serverTime: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(), itemCount: items.length, quantity: items.reduce((n, item) => n + item.quantity, 0), items: items.map((item, i) => ({ ...item, lineId: `money-line-${i}`, unitPriceUsdt: items.length === 1 ? "200.000000" : "100.000000", subtotalUsdt: items.length === 1 ? "200.000000" : "100.000000", discountUsdt: items.length === 1 ? "24.000000" : "12.000000", payableUsdt: items.length === 1 ? "176.000000" : "88.000000" })), subtotalUsdt: "200.000000", discountUsdt: "24.000000", amountUsdt: "176.000000", bundlePolicyVersion: 1, activityId: "money-promo", activityVersion: 1, eligibility: "ELIGIBLE", expectedRewards, warnings: [], reserved: false };
}
const order = { orderNo: "NX-MONEY-ORDER", productId: 1, productNo: "stellarbox-s1", productName: "StellarBox S1", quantity: 1, subtotalUsdt: 200, unitPriceUsdt: 200, discountUsdt: 24, amountUsdt: "176.000000", promotionQuoteId: "money-quote", paymentMethod: "WALLET", paymentStatus: "PAID", orderStatus: "COMPLETED", activationStatus: "ACTIVATED", canonicalStatus: "activated", orderType: "SINGLE", placedAt: now - 86400000, expiresAt: null, paidAt: now - 86400000, activatedAt: now - 3600000, refundedAt: null, refundAmountUsdt: null, refundChannel: null, refundBillNo: null, dataCenter: "Singapore", tradeinNo: null, sourceDeviceId: null, targetDeviceId: 703, targetDeviceInstanceNo: "MONEY-703", itemCount: 1, payBy: new Date(now + 86400000).toISOString(), rewards: expectedRewards, items: [{ lineId: "money-line-0", productNo: "stellarbox-s1", quantity: 1, productName: "StellarBox S1" }] };
const bills = ["USDT", "NEX"].map((asset, i) => ({ id: `money-bill-${i}`, bizNo: `MONEY-LEDGER-${i}`, bizType: "PROMOTION_REWARD", asset, direction: "IN", amount: i ? "789.000001" : "50.123456", balanceAfter: i ? "789.000001" : "1234.567891", amountExact: i ? "789.000001" : "50.123456", balanceAfterExact: i ? "789.000001" : "1234.567891", status: "SUCCESS", category: "bonus", presentationCode: "PROMOTION_REWARD", publicReference: "NX-MONEY-ORDER", remark: "", createdAt: iso }));
const product = (id, price) => ({ id, name: id === "stellarbox-s1" ? "StellarBox S1" : "StellarBox Pro", tier: "Entry", tagline: "Managed compute", badge: null, productType: "DEVICE", inventoryMode: "FINITE", gpu: "GPU", vram: "8GB", power: "100W", datacenter: "Singapore", warranty: "12 months", hashRate: null, dailyEarn: 1.234567, dailyEarnNEX: 4, price, sold: 1, stock: 10, features: ["Managed compute"], ai: null, status: "active", available: true, releaseState: null, releasePhaseId: null, unlocksAtPhase: null, purchaseGate: null });
const products = [product("stellarbox-s1", 200), product("stellarbox-pro", 50)];
const device = (productCode, id) => ({ id, rowVersion: 1, instanceNo: `MONEY-${id}`, name: productCode === "phone" ? "Phone" : "StellarBox S1", deviceType: productCode === "phone" ? "MOBILE" : "GPU", productCode, status: "ACTIVE", runtimeStatus: "ONLINE", pendingDeactivate: false, activatedAt: now - 3600000, deactivatedAt: null, purchasedAt: now - 86400000, dailyUsdt: 1.234567, dailyNex: 4, todayEarningsUsdt: 0.123456, todayEarningsNex: 0.4, gpuModel: "GPU", capabilityTops: 10, capabilityTier: 2, vramTotalGb: 8, basePowerW: 100, location: "Singapore", capacityPct: 100, capacityAgeMonths: 0, capacityConfigKey: "pro-v2", capacitySubsidized: false, capacitySubsidyDays: 0, capacitySubsidyRemainingDays: 0, capacitySubsidyEndsAt: null, actualPaidUsdt: 200, cumulativeOutputUsdt: 50.123456 });
const taskClasses = ["IG", "VG", "LL", "FT", "EM", "SP"].map((taskClass, i) => ({ taskId: `money-${taskClass}`, taskClass, taskName: taskClass, models: ["Model"], minReward: .1, maxReward: 1.234567, minVRAM: 4, enabled: true, avgSec: 60, dailyPotential: i + 1 }));
const fleet = { ...proof, source: "nx_user_device + nx_compute_receipt + nx_compute_e3_config", dailyUsdt: 4.938268, dailyNex: 16, realizedTodayUsdt: 50, realizedTodayNex: 16, walletUsdt: 1234.567891, walletNex: 789.000001, userJoinedAt: now - 86400000, serverNow: now, timezone: "UTC", slotCap: 6, devices: [device("phone", 701), device("pc-gpu", 702), device("stellarbox-s1", 703), device("cloud-share", 704)], capacitySchedule: { stageEarlyEnd: "3", stageMidEnd: "8", capacityFloorPct: "22", capacitySubsidyDays: "30", capacityBand1DeltaPct: "-4", capacityBand2DeltaPct: "-6", capacityBand3DeltaPct: "-23.7", capacityApplyToPhone: "false", capacityApplyToCloudShare: "false", capacityApplyToPcGpu: "false", capacityApplyToS1: "true", capacityApplyToPro: "true", capacityApplyToProV2: "true", capacityApplyToRackP1: "true", capacityApplyToRackP2: "true" } };
const walletDisplayStates = { "wallet-half-cent": { amount: 1.005, display: "1.01" }, "wallet-integer-carry": { amount: 999.995001, display: "1000.00" } };
const overview = { ...proof, source: "server:nx_compute_receipt,nx_compute_task,nx_user_device,nx_compute_datacenter,nx_product,nx_growth_promo_banner", generatedAt: iso, accountScope: "authenticated-account", earnings: { todayVsYesterdayPct: 5.2, ...Object.fromEntries(["today", "week", "month", "all"].map(k => [k, { usdt: 50, nex: 16, jobCount: 4 }])) }, earningsLedgerMode: "SETTLED", earningsLedger: [{ id: "money-earning", client: "Compute client", model: "Model", rewardUsdt: 1.234567, completedAt: iso, synthetic: false }], marketBoard: { workloads: taskClasses.map(task => ({ code: task.taskClass, name: task.taskName, unit: "unit", price: 50, deltaPct: 1, sparkline: [1, 2, 1.5], flagshipDeltaPct: null })), deviceRankings: [{ rank: 1, name: "StellarBox S1", kind: "stellarbox-s1", bestFor: "images", dailyUsdt: 1.234567 }] }, doTheMath: { basis: "OWNED_DEVICE_TO_NEXT_CATALOG_PRODUCT", base: { kind: "phone", name: "Phone", dailyUsdt: .06 }, target: { productNo: "stellarbox-s1", kind: "stellarbox-s1", name: "StellarBox S1", dailyUsdt: 1.234567, priceUsdt: 200 }, multiplier: 21, paybackDays: 162 }, weeklyPromo: null, onboarding: { cumulativePaidUsdt: 200, activeDevices: 4 }, onGrid: { clients: [{ id: "MONEY", name: "Compute client", model: "Model", city: "Singapore", gpus: 4 }], activeDevices: 4, activeJobs: 1, perSecUsdt: .001 } };
const caps = { ...proof, source: "G2/G3 server configuration", asset: "NEX", currency: "USDT", currentPrice: .125, userDailyCapUsdt: 5000, platformDailyCapUsdt: 100000, feePct: .1, feeMinUsdt: .1, minUsdt: .1, minNex: 1, queueMode: "QUEUE", swapEnabled: true };
const repurchaseProof = { ...proof, source: "nx_repurchase_product + nx_config_item + nx_emergency_control_setting" };
const kinds = ["direct_purchase", "direct_device_earning", "unilevel", "binary", "peer", "cultivation", "leadership", "genesis"];
const commissionEvents = kinds.map((kind, i) => ({ id: `money-commission-${i}`, kind, sourceUserName: "M***", sourceRef: "NX-MONEY-ORDER", amountUSDT: 50.123456, amountNEX: 789.000001, layer: 1, status: "unlocked", ts: now, unlockAt: now, settlementState: "CANONICAL", withdrawable: true }));
const aggregate = { totalUSDT: 400.987648, totalNEX: 6312.000008, directUSDT: 100.246912, extendedUSDT: 300.740736, contributorCount: 8, monthUSDT: 400.987648, monthNEX: 6312.000008, todayUSDT: 400.987648, unlockedUSDT: 400.987648, unlockedNEX: 6312.000008, coolingUSDT: 0, eventCount: 8, nextUnlockAt: null, byKind: Object.fromEntries(commissionEvents.map(e => [e.kind, { usdt: e.amountUSDT, nex: e.amountNEX, count: 1 }])) };
const withdrawal = { withdrawalNo: "WD-MONEY1234", targetAddress: `0x${"1".repeat(40)}`, createdAt: new Date(now - 3600000).toISOString(), amount: 50.123456, chain: "USDT-BEP20", status: "CONFIRMED", networkConfirmUsd: 1, networkFee: 1, penaltyFee: 0, grossFee: 1, nexBurned: 0, nexRefunded: 0, feeWaived: 0, actualFee: 1, netReceive: 49.123456, policyVersion: "money-policy", useNexFeeOffset: false, riskRoute: "fast-pass", idSource: "server", confirmedAt: iso, terminalReason: null, retriable: null };
const genesisSeries = { seriesCode: "genesis-main", name: "Genesis", totalSupply: 1000, soldSupply: 100, remainingSupply: 900, priceUsdt: 200, royaltyPct: 2.5, dailyEmissionRatePct: .1 };
const genesisSale = { serverCanonical: true, available: true, eligibilityEnabled: true, maxPerUser: 5, minAccountAgeDays: 0, presaleEnabled: false, showCountdown: false, unitPriceUsdt: 200, open: true };
const genesisEligibility = { ...proof, eligible: true, reasons: [], ownedCount: 1, maxPerUser: 5, remainingCap: 4, minAccountAgeDays: 0, accountAgeDays: 30, status: "READY", reservedAllocation: 50.123456, reservedAllocationUnit: "NEX", priorityRank: 1, priorityTier: "TOP_1", qualificationReasonCodes: [], policyVersion: "money-genesis", effectiveAt: iso, asOf: iso, serverTime: iso, provenance: { source: "nx_genesis_holding+nx_config_item", environment: "PRODUCTION", runId: "" }, halted: false };
const genesisTx = { orderNo: "GEN-MONEY-ORDER", orderType: "PRIMARY", quantity: 1, unitPriceUsdt: 200, amountUsdt: 200, royaltyUsdt: 0, completedAt: iso };
const genesisEmission = { batchNo: "GEN-MONEY-EMISSION", holdingNo: "GEN-MONEY-HOLDING", amountUsdt: 50.123456, status: "PAID", paidAt: iso };

function fixture(url, request, locale, state = "normal") {
  const p = url.pathname, empty = state === "empty";
  const rounding = walletDisplayStates[state], walletAmount = rounding?.amount ?? fleet.walletUsdt;
  if (p === "/api/app/profile") return { nickname: "Money probe", avatarUrl: "", avatarRevision: "", profileChangeIntervalDays: 7, nicknameChangeAvailableAt: null, avatarChangeAvailableAt: null, language: locale };
  if (p === "/api/app/profile/language") return { language: locale };
  if (p === "/api/devices/earnings") return { ...fleet, walletUsdt: walletAmount };
  if (p === "/api/app/home/overview") return overview;
  if (p === "/api/store/catalog") return { ...proof, source: "nx_product", revision: null, products };
  if (p === "/api/store/purchase-eligibility") return { ...proof, runId: null, source: "nx_product + nx_admin_device_sku + nx_user", productNo: url.searchParams.get("productNo"), eligible: true, decisionCode: "ELIGIBLE", policies: ["E1", "F4B"].map(policy => ({ policy, eligible: true, decisionCode: "ELIGIBLE", mode: "ALL", conditions: [] })), evaluatedAt: now };
  if (p === "/api/product/phase") return { phase: "P1", source: "H1_GROWTH_RHYTHM", devOverrideAllowed: false };
  if (p === "/api/store/bundle-discount") return { source: "server", serverCanonical: true, policyVersion: 1, tiers: [{ minItems: 2, rate: .05 }, { minItems: 3, rate: .08 }, { minItems: 4, rate: .12 }] };
  if (p === "/api/promotions") return { items: empty ? [] : [promotion], nextCursor: null, hasMore: false };
  if (p === "/api/promotions/money-promo") return promotion;
  if (p.endsWith("/referral-progress")) return { activityId: "money-promo", qualifyingOrders: 1, ownRewards: rewards, serverTime: iso };
  if (p === "/api/orders/quote") return quote(request.postDataJSON()?.items || selectedItems);
  if (p === "/api/orders") return { ...proof, runId: null, orders: empty ? [] : [order], nextCursor: null };
  if (p === "/api/promotion-rewards") return { items: empty ? [] : rewards, nextCursor: null, hasMore: false };
  if (p.startsWith("/api/promotion-rewards/")) return rewards.find(r => r.obligationId === p.split("/").at(-1));
  if (p === "/api/app/wallet/bills") {
    const asset = url.searchParams.get("asset");
    const rows = empty ? [] : bills.filter(b => !asset || b.asset === asset);
    return { ...proof, bills: rows, page: 1, pageSize: 50, total: rows.length, nextPage: null, nextCursor: null };
  }
  if (p === "/api/app/wallet/bills/summary") return { ...proof, timeZone: "UTC", asOf: iso, rewardsUsdt: 50.123456, rewardsNex: 789.000001, latestRewardAt: iso, todayNexEarn: 50, pendingNex: 24, monthBillCount: 2, recentNexBills: [bills[1]] };
  if (p === "/api/earnings/release-status") return { serverCanonical: true, buckets: { withdrawable: rounding ? walletAmount : 1200.123456, pending_review: 12.123456, bonus_locked: 22.320979 }, assets: {}, releaseMode: "manual_only", attestedOnlineSeconds: 0, requiredAttestationSeconds: 0, clusterRestricted: false };
  if (p === "/api/config/market/nex") return { ...proof, source: "G3 weekly_curve + nx_price_index sampled history", asset: "NEX", currency: "USDT", currentPrice: .125, costBasis: .085, sparkline: [.11, .12, .13, .12, .14, .13, .125], history: [], historyMaxDays: 365 };
  if (p === "/api/config/task-pricing") return { taskClasses, queueSaturation: .7, teaser: [], effectiveAt: iso, sources: ["runtime fixture"] };
  if (p === "/api/config/phone-tiers") return { tiers: [1, 2, 3, 4, 5].map(tier => ({ tier, name: `Tier ${tier}`, baseRateUsdt: tier * .1, baseRateNex: tier, effectiveAt: iso })), sources: ["runtime fixture"] };
  if (p === "/api/tasks/route") return { routable: true, deviceVramGb: Number(url.searchParams.get("deviceVramGb")), selectedTask: taskClasses[0], eligibleTaskClasses: taskClasses.map(t => t.taskClass), queueSaturation: .7, effectiveAt: iso, sources: ["runtime fixture"] };
  if (p === "/api/tasks/assignments") return { ...proof, serverNow: now, devices: [] };
  if (p === "/api/tasks/receipts") return { ...proof, items: empty ? [] : [{ receiptNo: "MONEY-RECEIPT", taskNo: "MONEY-TASK", taskClass: "IG", model: "Model", client: "Compute client", rewardUsdt: 1.234567, rewardNex: 4, earningStatus: "POSTED", completedAt: now }], nextOffset: null, nextCursor: null, total: empty ? 0 : 1 };
  if (p === "/api/config/exchange/caps") return caps;
  if (p === "/api/exchange") return { ...proof, caps, wallet: { usdtAvailable: walletAmount, nexAvailable: 789.000001 }, todayUserUsedUsdt: 50, todayPlatformUsedUsdt: 1000, lifetimeExchangedUsdt: 50.123456, ordersPage: { total: empty ? 0 : 1, pageNum: Number(url.searchParams.get("pageNum") || 1), pageSize: Number(url.searchParams.get("pageSize") || 20) }, orders: empty ? [] : [{ exchangeNo: "EX-MONEY123456", fromAsset: "USDT", toAsset: "NEX", fromAmount: 50.123456, toAmount: 400.987648, rate: .125, status: "COMPLETED", createdAt: iso }] };
  if (p === "/api/config/repurchase") return { ...repurchaseProof, product: "repurchase", asset: "USDT", pointsReward: false, apyPct: 35, lockDays: 90, nurtureMultiplier: 1, h1ReinvestMultiplier: 1, effectiveNurtureMultiplier: 1, ticketPerOrder: 1, presets: [50, 200, 1000], earlyPenaltyPct: 10, minAmountUsdt: 50, enabled: true, disclosureRequired: false, currentNexPriceUsdt: .125, g4LotteryCapacity: 1000, g4TicketsIssuedThisMonth: 1 };
  if (p === "/api/repurchase/orders") return { ...repurchaseProof, walletBalanceUsdt: walletAmount, serverTime: iso, ordersPage: { total: empty ? 0 : 1, pageNum: 1, pageSize: 50 }, orders: empty ? [] : [{ orderNo: "RPS-MONEY123456", amountUsdt: 50.123456, apyPct: 35, earlyPenaltyPct: 10, lockDays: 90, lockedAt: new Date(now - 86400000).toISOString(), unlockAt: new Date(now + 89 * 86400000).toISOString(), estimatedInterestUsdt: 4.325671, status: "ACTIVE" }] };
  if (p === "/api/withdrawals/policy") return { minAmount: 50, dailyLimitCount: 2, balanceMaxRatio: 1, smallAmountThresholdUsd: 100, strongReviewThresholdUsdt: 5000, payoutSlaHours: 24, networkConfirmFeeUsd: { trc20: 1, bep20: 1, erc20: 5 }, nexFeeOffsetRate: .1, policyVersion: "money-policy", cooldownDays: 7, complianceHoldEnabled: false, withdrawalEnabled: true, enabledNetworks: ["USDT-BEP20"], currentPhase: "P1", currentMonth: 1, gateSource: "J1", source: "D5+H1" };
  if (p === "/api/withdrawals") return { source: "nx_withdrawal_order", sourceEnvironment: "PRODUCTION", withdrawals: [withdrawal], page: { total: 1, pageNum: 1, pageSize: 50 } };
  if (p === "/api/withdrawals/WD-MONEY1234") return { ...proof, source: "nx_withdrawal_order", withdrawal };
  if (p === "/api/withdrawals/eligibility") return { canSubmit: true, maxWithdrawableUsdt: 1200.123456, route: "pass", riskReasons: [], fastLaneApplied: true, waivedGates: [], dailyLimitReached: false, dailyCountResetAt: now + 86400000, configVersion: "money-policy" };
  if (p === "/api/payout-addresses") return { ...proof, addresses: [{ ...proof, network: "USDT-BEP20", address: `0x${"1".repeat(40)}`, status: "ACTIVE", effectiveAt: new Date(now - 86400000).toISOString(), createdAt: new Date(now - 8 * 86400000).toISOString(), nextChangeAllowedAt: iso, changePending: false }], serverNowEpochMs: now, changeCooldownDays: 7, effectiveDelayHours: 24, inFlightWithdrawalBlocked: true };
  if (p === "/api/withdrawals/bank/config") return { enabled: true, bankSelection: "ACCOUNT_ROUTED", bankRoutingVerified: true, bankNameSource: "PROVIDER", banks: [], beneficiary: { bankCode: "VCB", bankName: "Vietcombank", maskedAccount: "******6789", beneficiaryNo: "BANK-MONEY123456", effectiveAt: new Date(now - 86400000).toISOString(), nextChangeAt: iso, canWithdraw: true, bankRoutingVerified: true }, unresolvedIntent: null, policy: { version: 1, minAmountUsd: 50, maxAmountUsd: 5000, feeRatePct: 1, feeMinUsd: 1, feeMaxUsd: 25 }, capacity: { maxWithdrawableUsdt: 1200.123456, dailyRemainingCount: 2, dailyLimitCount: 2, dailyCountResetAt: new Date(now + 86400000).toISOString(), withdrawalEnabled: true } };
  if (p === "/api/withdrawals/bank/quotes") return { quoteNo: `BQ-${"a".repeat(32)}`, amountUsdt: 50.123456, feeUsdt: 1, netUsdt: 49.123456, rateVnd: 25000, amountVnd: 1228086, bankCode: "VCB", bankName: "Vietcombank", maskedAccount: "******6789", expiresAt: new Date(now + 3600000).toISOString(), bankRoutingVerified: true };
  if (/^\/api\/withdrawals\/bank\/quotes\/BQ-[a-f0-9]{32}\/abandon$/.test(p)) return { state: "ABANDONED" };
  if (p === "/api/app/payments/config") return { ...proof, source: "nx_vietqr_config", vietQr: { enabled: true, paymentMode: "manual", dailyCapacityKnown: true, minDepositUsdt: 50, maxDepositUsdt: 5000, todayRemainingDepositUsdt: 5000, todayRemainingVnd: 125000000, toleranceVnd: 1000, graceMinutes: 10, version: 1, feeVnd: 0, feeUsdt: .123456 } };
  if (p === "/api/app/payments/fx-quote") return { ...proof, source: "nx_finance_fx_quote_config", baseRateVndPerUsdt: 25000, buySpreadPct: 0, quoteRateVndPerUsdt: 25000, lockWindowMinutes: 15, version: 1, asOf: iso };
  if (p === "/api/app/deposits/vietqr/intents") return { items: [] };
  if (p === "/api/app/deposits/vietqr/receipts") return { items: empty ? [] : [{ receiptNo: "MONEY-BANK-RECEIPT", intentNo: "VQR-MONEY123456", viewType: "credit", status: "credited", payableVnd: 1250000, receivedVnd: 1250000, lockedFxRate: 25000, creditedUsdt: 50.123456, createdAt: iso }], nextOffset: null };
  if (p === "/api/deposits/address") return { enabled: true, creditEnabled: true, network: "BEP20", address: `0x${"1".repeat(40)}`, feeUsdt: .123456, minDepositUsdt: 50, confirmations: 15 };
  if (p === "/api/deposits") return empty ? [] : [{ depositId: "CR-77", txHash: `0x${"a".repeat(64)}`, address: `0x${"1".repeat(40)}`, grossAmountUsdt: 50.123456, creditedUsdt: 50, confirmations: 15, status: "CREDITED", createdAt: now }];
  if (p === "/api/config/staking/pools") return { ...proof, source: "nx_staking_product + nx_config_item + nx_emergency_control_setting", pools: [30, 90, 180, 365].map((termDays, i) => ({ poolId: i + 1, tierKey: `usdt${termDays}d`, currency: "USDT", termDays, apyPct: 35, penaltyPct: 10, minAmountUsdt: 50, enabled: true, killed: false, status: "ACTIVE" })) };
  if (p === "/api/stakes") return { ...proof, source: "nx_staking_product + nx_config_item + nx_emergency_control_setting", walletBalanceUsdt: 1234.567891, serverTime: iso, positionsPage: { total: 1, pageNum: 1, pageSize: 50 }, positions: [{ positionNo: "STAKE-MONEY123456", tierKey: "usdt90d", productCode: "usdt90d", productName: "90 day USDT", amountUsdt: 50.123456, termDays: 90, apyPct: 35, penaltyPct: 10, lockedAt: new Date(now - 86400000).toISOString(), unlockAt: new Date(now + 89 * 86400000).toISOString(), estimatedInterestUsdt: 4.325671, status: "ACTIVE" }] };
  if (p === "/api/genesis/eligibility") return genesisEligibility;
  if (p === "/api/genesis/state") {
    const listings = [{ holdingNo: "GEN-MONEY-LISTING", seriesCode: "genesis-main", askPriceUsdt: 50.123456, listedAt: iso, seller: "M***" }];
    if (url.searchParams.has("history")) return { ...proof, items: url.searchParams.get("history") === "transactions" ? [genesisTx] : listings, nextCursor: null };
    return { ...proof, halted: false, revision: "money-genesis", source: "nx_emergency_control_setting:killswitch.genesis", series: genesisSeries, sale: genesisSale, market: { enabled: true }, emission: { open: true }, listings, transactions: [genesisTx], tiers: [{ id: "tier-1", from: 0, to: 1000, priceUSDT: 200 }], tiersVersion: 1, marketOpenState: "open", marketOpenStateVersion: 1, closedNoticeKey: "default", showcaseEnabled: true, catalogAvailable: true, tradeAvailable: true, tradeBlockedReason: "NONE", secondaryCommandProtocol: 2, marketStats: { floorUsdt: 50.123456, volume24hUsdt: 200, owners: 100, floorDeltaPct: -12.5, lastSaleUsdt: 200 } };
  }
  if (p === "/api/genesis/account") {
    if (url.searchParams.has("history")) return { ...proof, items: url.searchParams.get("history") === "orders" ? [genesisTx] : [genesisEmission], nextCursor: null };
    return { ...proof, series: genesisSeries, sale: genesisSale, eligibility: genesisEligibility, marketEnabled: true, emissionOpen: true, holdings: [{ holdingNo: "GEN-MONEY-HOLDING", seriesCode: "genesis-main", acquiredPriceUsdt: 200, status: "ACTIVE", listingPriceUsdt: null, acquiredAt: iso, listedAt: null }], emissions: [genesisEmission], orders: [genesisTx], emissionTotals: { paidUsdt: 50.123456, pendingUsdt: 24 }, walletBalanceUsdt: 1234.567891 };
  }
  if (p === "/api/payment-methods") return { serverCanonical: true, cards: [] };
  if (p === "/api/config/commission/rates") return { ...proof, runId: null, unilevel: [10, 5, 3, 2, 1, .5, .5].map((usdtPct, i) => ({ level: `L${i + 1}`, usdtPct, nexReward: 0 })), unilevelPaused: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`L${i + 1}`, false])), partnerTiersJson: JSON.stringify({ standard: 0, verified: 5000, premium: 50000, diamond: 500000 }), influenceClampMin: 1, influenceClampMax: 5, coolingDays: 7, promoMultiplier: 1 };
  if (p === "/api/config/commission/guide") return { ...proof, runId: null, coolingDays: 7, network: { depthGateLayer: 5, depthGateRank: 4, exitCapRate: .25 }, binary: { threshold: 1000, matchRate: .1, dailyCap: 5000, settlePeriod: "daily", residualPolicy: "carryForward", paused: false }, leadership: { rate: .05, minRank: 3, monthlyCap: 1000 }, capabilities: { peer: false, genesis: false } };
  if (p === "/api/config/commission/direct-referral") return { ...proof, configured: true, policyVersion: 1, effectiveAt: iso, nexUsdtPrice: .125, schemaVersion: 2, settlementMode: "SEVEN_V2", purchaseSplit: { enabled: true, usdtSharePct: 60 }, sevenLayerReference: { revision: 1, baseRatePct: 10, coolingDays: 7, legacyNexPerUsd: 2 }, deviceEarning: { enabled: true, totalRatePct: 5, usdtSharePct: 70, coolingDays: 0 } };
  if (p === "/api/app/team/insights/commissions") return { ...proof, events: empty ? [] : commissionEvents, aggregate: empty ? { ...aggregate, eventCount: 0 } : aggregate, page: 1, pageSize: 20, totalRows: empty ? 0 : 8, generatedAt: iso, snapshotAt: iso };
  if (p === "/api/app/team/insights/unilevel" || p === "/api/app/team/insights/direct-referral") {
    const isNetwork = p.endsWith("/unilevel"), amount = { amountUSDT: 50.123456, amountNEX: 789.000001, count: 1 }, zero = { amountUSDT: 0, amountNEX: 0, count: 0 };
    return { ...proof, schemaVersion: 2, settlementMode: "SEVEN_V2", filter: url.searchParams.get("filter") || "all", page: 1, pageSize: Number(url.searchParams.get("pageSize") || 20), period: url.searchParams.get("period") || "month", totalRows: empty ? 0 : 1, events: empty ? [] : [{ ...commissionEvents[0], kind: isNetwork ? "direct_purchase" : "direct_device_earning", source: "direct_purchase", cycle: "2026-10", layer: 1, orderId: "NX-MONEY-ORDER", orderAmountUSD: 200, currency: "DUAL", basisUsdt: 200, nexUsdtPrice: .125, policyVersion: 1, sourceDeviceId: "703" }], split: isNetwork ? { direct: empty ? zero : amount, extended: zero } : { purchase: zero, deviceEarning: empty ? zero : amount }, summary: { ...(empty ? zero : amount), creditedUSDT: 50.123456, creditedNEX: 789.000001, pendingUSDT: 0, pendingNEX: 0 }, generatedAt: iso, snapshotAt: iso };
  }
  if (p === "/api/app/team/insights/leadership-pool") return { ...proof, currentWeekPoolUSDT: 1000, myRank: 3, myVotes: 1, totalVotes: 10, mySharePct: .1, projectedPayoutUSDT: 100, distribution: [{ vRank: 3, people: 10, votes: 1 }], history: [{ weekId: "2026-W40", payoutUSDT: 50.123456 }], nextPayoutAt: new Date(now + 86400000).toISOString(), unlockRank: 3, injectRate: .05, topN: 10 };
  if (p === "/api/app/team/insights/leaderboard") return { ...proof, period: url.searchParams.get("period") || "month", rows: [{ rank: 1, handle: "M***", flag: "SG", cc: "SG", directs: 1, teamSize: 1, earnedUSDT: 50.123456, delta: 0, vRank: 3, hasDevice: true }], myRank: 1, gapToNext: 0, poolUsd: 1000, topN: 10, page: 1, pageSize: 20, totalRows: 1, generatedAt: iso, snapshotAt: iso, snapshotVersion: null };
  if (p === "/api/config/v-ranks") return { ...proof, source: "nx_v_rank_config", prizeName: "Ranks", capabilities: { peer: false, genesis: false }, ranks: Array.from({ length: 13 }, (_, v) => ({ v, title: `V${v}`, cnTitle: `V${v}`, directBonus: .1, unilevelDepth: 1, peerBonus: 0, leadershipVotes: v >= 3 ? 1 : 0, cultivationBonus: v >= 1 ? 50 : 0, rewards: [], visible: true })) };
  if (p === "/api/team/rank") return { ...proof, source: "nx_team_member + server VRankPerformanceRepository", rankCode: "V3", progress: { selfBuyUSD: 200, directRefs: 1, teamVolumeUSD: 3000, vDownlineCounts: {} } };
  if (p === "/api/app/team/network") return { ...proof, totalMembers: 1, directMembers: 1, activeMembers: 1, monthVolumeUsdt: 200, lifetimeVolumeUsdt: null, members: [{ id: "42", name: "M***", avatarUrl: null, vRank: 1, layer: 1, leg: "A", joinedAt: iso, monthVolumeUsdt: 200, lifetimeVolumeUsdt: null, status: "ACTIVE", region: "SG" }], nextCursor: null, generatedAt: iso };
  if (p === "/api/team/binary") return { ...proof, runId: null, asOfDate: iso.slice(0, 10), trackA: 2000, trackB: 3000, trackAMembers: 1, trackBMembers: 1, autoPlacedMembers: 0, matchRate: .1, threshold: 1000, dailyCap: 5000, periodCap: 5000, estimatedAmountUsdt: 200, settlePeriod: "daily", residualPolicy: "carryForward", spilloverEnabled: true, gvReset: "monthly", paused: false, blockedReason: "", recentMatches: [{ id: "money-binary", amountUsdt: 50.123456, status: "unlocked", createdAt: iso, unlockAt: iso }] };
  if (p === "/api/goals") return { serverCanonical: true, source: "nx_earning_goal", lifetimeEarningsUsdt: 50.123456, goals: [{ id: 1, targetUsdt: 200, deadlineAt: now + 30 * 86400000, createdAt: now - 86400000, achieved: false, achievedAt: null, progressPct: 25, lifetimeEarningsUsdt: 50.123456 }] };
  if (p === "/api/goals/recommendation") return { ...proof, source: "nx_product + nx_earning_goal", purchaseRequired: true, productNo: "stellarbox-s1", productName: "StellarBox S1", dailyEarn: 1.234567, price: 200, requiredDaily: 5, targetUsdt: 200, days: 30 };
  if (p === "/api/points/state") return { ...proof, source: "nx_daily_check_in + nx_daily_milestone", rewardAsset: "NEX", serverDate: iso.slice(0, 10), nextResetAtUtc: new Date(now + 86400000).toISOString(), streak: { currentStreak: 1, longestStreak: 1, streakSavers: 0, lastCheckInDate: iso.slice(0, 10), checkedInToday: true }, dailyMilestones: [], earningMilestones: [], badgeAchievements: [], powerUps: [], rules: [{ key: "baseNex", value: "50" }], topStreakers: [] };
  if (p === "/api/quests/state") return { ...proof, source: "nx_mission + nx_user_mission", quests: [{ questCode: "money-weekly", name: "Explore the marketplace", layer: "WEEKLY_T1", rewardNex: 50, status: "CLAIMABLE", category: "explore", actionRoute: "/pages/store/store", instanceKey: "WEEK:money", eligibleFrom: new Date(now - 86400000).toISOString(), eligibleUntil: new Date(now + 86400000).toISOString(), eligible: true }], dayOneRewardNex: 50, dayOneRequiredTaskCount: 0, dayOneSnapshotStatus: "EMPTY", promoBanner: null, questBonusMultiplier: 1, rhythmMonth: 1 };
  if (p === "/api/app/support/conversations/UI-CV-1" || p === "/api/app/support/conversations/UI-CV-1/read") return { conversation: { conversationNo: "UI-CV-1", conversationType: "support", status: "CLOSED", version: 2, ownerAgentName: "Advisor", unreadCount: 0, lastMessage: "Reply", lastMessageAt: iso }, messages: [{ id: 1, senderType: "user", content: "Question", createdAt: iso, receiptStatus: "read" }, { id: 2, senderType: "agent", content: "Reply", createdAt: iso, receiptStatus: "read" }], historyTruncated: false, nextCursor: null };
  if (p === "/api/app/referral-rewards") return { referralCode: "MONEY", rewardEnabled: true, inviterRewardNex: 50, invitedCount: 1, pendingCount: 0, settledCount: 1, lifetimeInviterNex: 50, walletNexAvailable: 789.000001, limit: 10, source: "ledger", sourceEnvironment: "PRODUCTION", runId: null, factSources: ["nx_referral_reward_settlement", "nx_wallet_ledger", "nx_earnings_release_entry", "nx_user_wallet"], refreshedAt: iso, recentRewards: [{ settlementNo: "MONEY-SET-1", amountNex: 50, ledgerStatus: "SUCCESS", balanceAfter: 789.000001, releaseBucket: "withdrawable", sourceEnvironment: "PRODUCTION", settledAt: iso }] };
  if (p === "/api/config/referral-rewards") return { enabled: true, welcomeGift: { lockMode: "risk_bucket", usdtAmount: 0, nexAmount: 0 }, inviterReward: { nexAmount: 50 }, rhythmMonth: 1, newcomerMultiplier: 1, inviterMultiplier: 1, effectiveAt: iso, sources: ["nx_user.sponsor_user_id"] };
  if (p === "/api/config/platform") return { featureFlags: { computeShareEnabled: true, homeNewcomerTasksEnabled: false, homeWeeklyPromoEnabled: false }, share: { baseUrl: "https://money.invalid/ref/", channels: [], appDownload: { officialUrl: "", iosUrl: "", androidUrl: "", apkUrl: "", version: "", releaseNotes: { zh: "", en: "" }, source: "unavailable" } }, publicStats: { version: 1, ...proof, source: "server:nx_config_item,nx_user", realUserCount: 4 }, onlineBonus: { h5BaseFactor: .6, continuityFullHours: 24 }, updatedAt: iso };
  if (p === "/api/notifications") return { items: [], nextCursor: null, unread: 0 };
  return undefined;
}

// Monetary units only: percentages, counts, hardware, editable values and rate equations are separate contracts.
const numberPattern = String.raw`[+−-]?(?:\d{1,3}(?:[,\.\u00a0\u202f ]\d{3})+|\d+)(?:[.,]\d+)?(?:[KMB])?(?!\d|[.,]\d)`;
function moneyTokens(text) {
  if (/^\s*(?:exchange rate|tỷ giá|汇率|@\s*\d)/i.test(text)) return [];
  const equation = new RegExp(String.raw`\b1\s+(?:NEX|USDT)\s*(?:=|≈)\s*\$?${numberPattern}\s*(?:NEX|USDT|VND|₫)?`, "g");
  const monetaryText = text.replace(equation, match => " ".repeat(match.length));
  const pattern = new RegExp(String.raw`(?:\$\s*(${numberPattern})|(${numberPattern})\s*(USDT|USD|NEX|VND|₫)(?![\w])|\b(USDT|USD|NEX|VND)\s+(${numberPattern}))`, "g");
  return [...monetaryText.matchAll(pattern)].filter(m => !/^\s*%/.test(text.slice(m.index + m[0].length))).map(m => ({ text: m[0], value: m[1] || m[2] || m[5], unit: m[3] || m[4] || "USD" }));
}
function canonicalDisplay(value) {
  const raw = value.replace(/[+−-]/g, "").replace(/[KMB]$/, "");
  const decimal = raw.match(/[.,](\d+)$/);
  if (!decimal || decimal[1].length !== 2) return null;
  const amount = `${raw.slice(0, decimal.index).replace(/[,\.\s\u00a0\u202f]/g, "")}.${decimal[1]}`;
  const suffix = value.match(/[KMB]$/)?.[0];
  return suffix ? (Number(amount) * ({ K: 1000, M: 1000000, B: 1000000000 })[suffix]).toFixed(2) : amount;
}
function currencyDisplays(nodes, stage = "page") {
  const unique = new Map();
  for (const node of nodes) for (const token of moneyTokens(node.text)) {
    const key = `${node.source || "text"}\0${node.class}\0${token.text}`;
    if (!unique.has(key)) unique.set(key, { ...token, class: node.class, source: node.source || "text", stage, context: node.text, canonical: canonicalDisplay(token.value) });
  }
  return [...unique.values()];
}
if (process.argv.includes("--self-check")) {
  for (const text of ["$50", "$50.", "Stake $100.", "$200.000000, then pay.", "$1,234.567891.", "200.000000 USDT", "789 NEX", "USD 50."]) {
    assert(moneyTokens(text).some(t => canonicalDisplay(t.value) === null), `Red witness missed ${text}`);
  }
  for (const text of ["$50.00", "$50.00.", "$50.00, then pay.", "+50.12 USDT", "789,00 NEX", "$1,234.57.", "−$24.00"]) assert(moneyTokens(text).length && moneyTokens(text).every(t => canonicalDisplay(t.value)), `Valid amount rejected: ${text}`);
  assert.equal(canonicalDisplay("1.00K"), "1000.00");
  assert.deepEqual(moneyTokens("1 NEX = 0.125 USDT"), []);
  assert.deepEqual(moneyTokens("≈ 98.63 USDT · 1 NEX = 0.125 USDT").map(t => t.value), ["98.63"]);
  assert.deepEqual(moneyTokens("1 NEX ≈ $0.12500 USDT"), []);
  assert.deepEqual(moneyTokens("50% · 8 GB · 6 devices"), []);
  for (const source of ["aria-label", "aria-valuetext"]) {
    const witness = currencyDisplays([{ text: "Confirm $50.123456", source, class: "confirm" }]);
    assert.equal(witness.length, 1, `Accessibility red witness missed ${source}`);
    assert.equal(witness[0].source, source);
    assert.equal(witness[0].canonical, null, `Accessibility red witness rounded away ${source}`);
  }
  assert.equal(quote().amountUsdt, "176.000000");
  assert.equal(bills[0].amountExact, "50.123456");
  for (const [state, rounding] of Object.entries(walletDisplayStates)) assert.equal(fixture(new URL("http://fixture.invalid/api/devices/earnings"), {}, "en", state).walletUsdt, rounding.amount, `Rounding scenario mutated ${state}'s HTTP source`);
  assert.equal(fixture(new URL("http://fixture.invalid/api/devices/earnings"), {}, "en").walletUsdt, 1234.567891);
  const source = await readFile(fileURLToPath(import.meta.url), "utf8");
  const loop = source.match(/(        const until = Date\.now\(\) \+ 12000;[\s\S]*?)\n      }\r?\n      record\.amounts/)?.[1];
  assert(loop, "Actual DOM readiness loop is missing from its regression check");
  const runLoop = new (Object.getPrototypeOf(async function () {}).constructor)(
    "dom", "expected", "readDOM", "page", "state", "Date", "moneyTokens", "canonicalDisplay", "currencyDisplays", "boundary", "settle", "fail", "record", "route",
    loop + "\nreturn dom;",
  );
  for (const [frames, valid] of [
    [["$50.000000", "$50.00"], false], [["$50", "$50.00"], false],
    [["Loading", "$50.000000", "$50.00"], false], [["$50.00 + $1.123456"], false],
    [["$50.13"], false], [["-"], false], [["$50.00"], true], [["Loading", "$50.00"], true],
  ]) {
    let cursor = 0, tick = 0;
    const frame = () => ({ text: frames[Math.min(cursor++, frames.length - 1)], monetaryText: [{ text: frames[Math.min(cursor - 1, frames.length - 1)], class: "money" }] });
    const record = { assertions: [], issues: [] };
    const dom = await runLoop(frame(), [null, ["50.00"]], async () => frame(), { waitForTimeout: async () => {} }, {},
      { now: () => tick += 5000 }, moneyTokens, canonicalDisplay, currencyDisplays, () => {}, async () => {},
      (row, message) => row.issues.push(message), record, "pages/money-test");
    assert.equal(record.issues.length === 0 && currencyDisplays(dom.monetaryText).every(token => token.canonical), valid, `Readiness discarded an observed format or required amount: ${frames.join(" -> ")}`);
  }
  console.log("amount-display self-check: PASS (integer, six-digit and a11y red witnesses, locale separators, non-money exclusions, exact fixtures)");
  process.exit(0);
}

async function snapshot() {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).split("\0").filter(Boolean).sort();
  const hash = createHash("sha256");
  for (const file of files) { hash.update(file); hash.update("\0"); hash.update(existsSync(path.join(root, file)) ? await readFile(path.join(root, file)) : "DELETED"); hash.update("\0"); }
  return { hash: hash.digest("hex"), head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(), files: files.length };
}
function boundary() {
  if (process.env.WORKFLOW_ABORT_FILE && existsSync(process.env.WORKFLOW_ABORT_FILE)) throw new Error(`WORKFLOW_ABORT_FILE requested safe stop: ${process.env.WORKFLOW_ABORT_FILE}`);
  if (interrupted) throw new Error("Termination requested; no further browser action started");
}
let interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { interrupted = true; });
const before = await snapshot();
const report = { verdict: "fail", mode: smoke ? "smoke" : "full", capability: "runtime", treeMoved: false, frontendOnly: true, boundary: "HTTP/WS fixtures; H5 redirects verified as H5 contracts, native rendering unverified; no live financial actions", taskId: process.env.WORKFLOW_TASK_ID || "amount-display-20261012", stepId: process.env.WORKFLOW_STEP_ID || "runtime", checkId: process.env.WORKFLOW_CHECK_ID || "amount-display-runtime", runId: process.env.WORKFLOW_RUN_ID || randomUUID(), repo: process.env.WORKFLOW_REPO || root, snapshotHash: process.env.WORKFLOW_SNAPSHOT_HASH || before.hash, sourceStart: before, startedAt, timestamps: { startedAt }, innerSkipped: 0, steps: [], coverage: { registeredRoutes: [...allRoutes], locales: ["en", "zh", "vi"], themes: ["dark", "light"], widths: [390, 320], expectedCombinations: allRoutes.length * 12, visits: [], failures: [], unverified: [], boundaries: [], extraStates: [] }, screenshots: [] };
let server, browser, visits = 0;
const fail = (record, message, status = "fail") => { record.issues.push(message); report.coverage[status === "unverified" ? "unverified" : "failures"].push({ route: record.route, locale: record.locale, theme: record.theme, width: record.width, scenario: record.scenario, message }); };
const variants = smoke && !smokeMatrix ? [{ locale: "en", theme: "dark", width: 390 }] : ["en", "zh", "vi"].flatMap(locale => ["dark", "light"].flatMap(theme => [390, 320].map(width => ({ locale, theme, width }))));
const contexts = new Map();
async function pageFor(variant, authenticated) {
  const key = JSON.stringify({ ...variant, authenticated });
  if (contexts.has(key)) return contexts.get(key);
  const context = await browser.newContext({ viewport: { width: variant.width, height: 844 }, locale: variant.locale === "zh" ? "zh-CN" : variant.locale === "vi" ? "vi-VN" : "en-GB", colorScheme: variant.theme });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.setDefaultNavigationTimeout(30000);
  const state = { mode: "normal", errors: [], requests: [], pending: new Set(), lastRequest: 0 };
  await page.addInitScript(({ locale, theme }) => {
    const put = (key, data) => localStorage.setItem(key, JSON.stringify({ type: "object", data }));
    put("nexgrid-locale-v1", { code: locale, userSet: true });
    put("nexgrid-theme-v1", { mode: theme });
    put("nexgrid-voucher-claim-sheet-v1", { lastClosedAt: 9999999999999 });
    put("nexgrid-trial-claim-sheet-v1", { lastClosedAt: 9999999999999 });
  }, variant);
  await installFormalProbeSession(page, { authenticated, responseFor: (url, request) => fixture(url, request, variant.locale, state.mode) });
  // Failure is returned by the real HTTP boundary; DOM and store values are never overwritten.
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url()), p = url.pathname;
    if (state.mode === "error" && /^(?:\/api\/(?:promotion-rewards|promotions|orders|repurchase|exchange|tasks\/receipts)|\/api\/app\/wallet\/bills)/.test(p)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: 503, message: "AMOUNT_PROBE_UNAVAILABLE", data: null }) });
    }
    return route.fallback();
  });
  await page.route(/https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/, route => route.fulfill({ status: 200, contentType: "text/css", body: "" }));
  page.on("pageerror", error => { state.errors.push({ kind: "pageerror", message: error.message }); });
  page.on("console", message => { if (message.type() === "error") state.errors.push({ kind: "console", message: message.text(), location: message.location() }); });
  page.on("request", request => { const url = new URL(request.url()); if (/^\/(?:api|auth)\//.test(url.pathname)) { state.pending.add(request); state.lastRequest = Date.now(); state.requests.push({ path: url.pathname, method: request.method(), body: request.postData(), fixture: true }); } });
  page.on("requestfinished", request => state.pending.delete(request));
  page.on("requestfailed", request => state.pending.delete(request));
  contexts.set(key, { page, state });
  return { page, state };
}
async function settle(page, state) {
  const until = Date.now() + 15000;
  while ((state.pending.size || Date.now() - state.lastRequest < 150) && Date.now() < until) {
    boundary(); await page.waitForTimeout(40);
  }
  assert.equal(state.pending.size, 0, "Business requests did not settle; amount data is unverified");
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function readDOM(page, target) {
  return page.evaluate(target => {
    // UniApp canonicalizes its first page to #/ after reLaunch. Check the real
    // page node as well as that documented root alias, never another route.
    const route = location.hash.slice(2).split("?")[0] || "pages/index/index";
    const active = [...document.querySelectorAll("uni-page")].find(el => el.dataset.page === route && el.getBoundingClientRect().height > 0);
    const visible = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" && !el.closest("[aria-hidden=true]"); };
    const belongs = el => !el.closest("uni-page") || el.closest("uni-page") === active;
    const roots = [active, ...document.querySelectorAll(".nx-mask, .nx-toast, [role=dialog], [role=alert], [role=status]")].filter(el => el && belongs(el) && visible(el));
    const elements = [...new Set(roots.flatMap(el => [el, ...el.querySelectorAll("uni-text, .nx-wallet-amount, .promotion-price, .promotion-summary, [role=alert], [role=status], [aria-label], [aria-valuetext]")]))].filter(visible);
    const leaves = elements.flatMap(el => {
      const attributes = ["aria-label", "aria-valuetext"].filter(name => el.hasAttribute(name)).map(name => ({ text: el.getAttribute(name), source: name, class: String(el.className || ""), selector: el.getAttribute("data-testid") || String(el.className || "") }));
      if (!el.matches("uni-text, .nx-wallet-amount, .promotion-price, .promotion-summary, .nx-mask, .nx-toast, [role=alert], [role=status], [role=dialog]")) return attributes;
      let text = el.textContent.replace(/\s+/g, " ").trim();
      if (active?.dataset.page === "pages/me/wallet-nex" && /Platform baseline|平台基准价|Giá mốc nền tảng/.test(el.parentElement?.textContent || "")) return attributes;
      if (/^\d[\d,.]*$/.test(text) && el.parentElement?.textContent.length < 120 && /\$|USDT|NEX/.test(el.parentElement.textContent)) text = el.parentElement.textContent.replace(/\s+/g, " ").trim();
      return [...attributes, { text, source: "text", class: String(el.className || ""), selector: el.getAttribute("data-testid") || String(el.className || "") }];
    }).filter(item => item.text && !/loss|gpu|vram|tops|hashrate/i.test(item.class));
    const components = target ? [...document.querySelectorAll(target)].filter(el => belongs(el) && visible(el)) : [];
    return { actualRoute: active?.dataset.page || null, actualTheme: document.documentElement.dataset.theme, locale: JSON.parse(localStorage.getItem("nexgrid-locale-v1") || "{}").data?.code, text: active?.innerText || "", monetaryText: leaves, component: target ? { present: components.length > 0, text: components.map(component => component.innerText).join("\n") } : null };
  }, target);
}
async function visit(route, variant, { scenario = "manifest", query = queries[route], stateMode = "normal", expected = keySurfaces[route], input = false, confirmCancel = false, shot = false } = {}) {
  boundary();
  const record = { route, ...variant, scenario, state: stateMode, status: "unverified", startedAt: new Date().toISOString(), issues: [], amounts: [], assertions: [], errors: [], requests: [], evidence: [] };
  const { page, state } = await pageFor(variant, !anonymous.has(route));
  state.mode = stateMode; state.errors = []; state.requests = [];
  try {
    const url = new URL(directAppUrl(server.baseUrl, route + (query ? `?${query}` : "")));
    url.searchParams.set("amount_probe", `${report.runId}-${++visits}`);
    await page.goto(url.href, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector("uni-page") && document.body.innerText.trim().length > 0);
    await settle(page, state);
    if (expected?.[0] && !input) {
      await page.locator(expected[0]).first().waitFor({ state: "visible" });
      await settle(page, state);
    }
    boundary();
    let dom = await readDOM(page, expected?.[0]);
    record.actualRoute = dom.actualRoute;
    const contract = h5Boundaries[route];
    const isBoundary = dom.actualRoute !== route && contract?.target === dom.actualRoute;
    if (dom.actualRoute !== route && !isBoundary) { fail(record, `Target ${route} redirected to ${dom.actualRoute}; target DOM was not verified`, "unverified"); record.redirectText = dom.text.slice(0, 500); }
    else {
      if (isBoundary) {
        await page.locator(contract.selector).first().waitFor({ state: "visible" });
        await settle(page, state);
        dom = await readDOM(page, expected?.[0]);
        assert.equal(dom.actualRoute, contract.target, "H5 boundary changed before its content became ready");
        assert(await page.locator(contract.selector).isVisible(), `H5 boundary content absent: ${contract.selector}`);
        const exit = page.locator(contract.exit).first();
        await exit.waitFor({ state: "visible" });
        assert(await exit.isVisible(), `H5 boundary exit is unreachable: ${contract.exit}`);
        assert.notEqual(await exit.getAttribute("aria-disabled"), "true", "H5 boundary exit is disabled");
        record.boundaryVerified = { route, ...variant, ...contract, nativeRendering: "unverified", actualRoute: dom.actualRoute, content: dom.text.slice(0, 700) };
        report.coverage.boundaries.push(record.boundaryVerified);
      }
      if (dom.actualTheme !== variant.theme) fail(record, `Expected ${variant.theme} theme, got ${dom.actualTheme}`);
      if (dom.locale !== variant.locale) fail(record, `Expected ${variant.locale} locale, got ${dom.locale}`);
      if (route === "pages/store/bundle" && query?.includes("activityId=")) {
        const review = page.locator("[data-testid=promotion-bundle] .promotion-action").nth(0);
        await page.waitForFunction(() => document.querySelector('[data-testid=promotion-bundle] .promotion-action')?.getAttribute('aria-disabled') === 'false');
        await review.click(); await settle(page, state);
        record.evidence.push("Clicked the real promotion quote action for the two selected products");
        dom = await readDOM(page, expected?.[0]);
      }
      if (scenario === "ordinary-bundle") {
        for (const name of ["UVELBox S1", "UVELBox Pro"]) {
          const add = page.locator(`uni-page[data-page="${route}"] [role=button][aria-label]`).filter({ hasText: name }).last();
          await add.waitFor({ state: "visible" });
          await add.click();
          await add.waitFor({ state: "hidden" });
          await settle(page, state);
        }
        expected = [null, ["250.00", "12.50", "237.50"]];
        dom = await readDOM(page, null);
      }
      if (route === "pages/me/wallet-withdraw-bank") {
        await page.locator('[data-testid=bank-continue]').click(); await settle(page, state);
        dom = await readDOM(page, expected?.[0]);
        record.evidence.push("Continued from the actual bank recipient screen to its amount and limits screen");
      }
      if (route === "pages/team/network") {
        const member = page.locator('[role=button][aria-label*="M***"]:visible').first();
        await member.click(); await settle(page, state);
        dom = await readDOM(page, expected?.[0]);
        record.evidence.push("Opened the actual member detail showing its monthly purchase amount");
      }
      if (scenario === "crypto-deposit") {
        await page.locator(".nx-topup-seg-crypto").click();
        await page.locator(".nx-dep-net-bep20").waitFor({ state: "visible" });
        await settle(page, state);
        dom = await readDOM(page, expected?.[0]);
      }
      if (input) {
        const field = page.locator(`uni-page[data-page="${route}"] input:visible`).first();
        await field.fill("50.123456");
        assert.equal(await field.inputValue(), "50.123456", "Editable input was rounded to display precision");
        record.assertions.push({ id: "six-digit-input-preserved", pass: true, evidence: "Real decimal input retained 50.123456 after input event" });
        await settle(page, state);
        dom = await readDOM(page, expected?.[0]);
        if (route === "pages/me/wallet-withdraw-bank") {
          await page.locator('[data-testid=bank-quote]').click(); await settle(page, state);
          dom = await readDOM(page, expected?.[0]);
        }
      }
      if (stateMode === "empty" || stateMode === "error") {
        const ready = stateMode === "error" ? "[role=alert]" : ".promotion-main > .promotion-flat:not([role]) > .promotion-title";
        await page.locator(`uni-page[data-page="${route}"] ${ready}`).first().waitFor({ state: "visible" });
        await settle(page, state);
        dom = await readDOM(page, expected?.[0]);
        record.evidence.push(`Waited for the actual ${stateMode} result before checking its amounts`);
      }
      if (expected && stateMode !== "empty" && stateMode !== "error") {
        // Currency tokens cover split labels too; component digits are additionally
        // checked for wallet's separate currency glyph and numeric child.
        const until = Date.now() + 12000;
        let componentText, actual;
        do {
          componentText = expected[0] ? dom.component?.text || "" : dom.text;
          actual = new Set([...moneyTokens(componentText).map(t => canonicalDisplay(t.value)), ...componentText.match(/[\d][\d,.\s]*[.,]\d{2}(?!\d)/g)?.map(s => canonicalDisplay(s.trim())) || []]);
          if (currencyDisplays(dom.monetaryText).some(token => !token.canonical) || expected[1].every(value => actual.has(value)) || Date.now() >= until) break;
          boundary(); await page.waitForTimeout(50); await settle(page, state);
          dom = await readDOM(page, expected[0]);
        } while (true);
        if (expected[0] && !dom.component?.present) fail(record, `Required real component absent: ${expected[0]}`, "unverified");
        for (const value of expected[1]) {
          const pass = actual.has(value);
          record.assertions.push({ id: `component-amount-${value}`, pass, selector: expected[0] || `uni-page[data-page="${route}"]`, evidence: componentText.slice(0, 1200) });
          if (!pass) fail(record, `Required fixture amount ${value} absent from ${expected[0] || route}`, "unverified");
        }
      }
      record.amounts = currencyDisplays(dom.monetaryText);
      for (const token of record.amounts) if (!token.canonical) fail(record, `Amount requires exactly 2 decimals: ${token.text} (${token.class || "text"})`);
      if (walletDisplayStates[stateMode]) {
        const original = await page.evaluate(async () => {
          const runtimeUrl = performance.getEntriesByType("resource").map(e => e.name).find(name => name.includes("/src/api/runtime.ts")) || "/src/api/runtime.ts";
          const api = await import(runtimeUrl);
          const [funds, release] = await Promise.all([api.deviceE3Api.fleet(), api.earningsReleaseApi.status()]);
          return { walletUsdt: funds.walletUsdt, withdrawable: release.buckets.withdrawable, serverCanonical: funds.serverCanonical && release.serverCanonical };
        });
        assert.equal(original.walletUsdt, walletDisplayStates[stateMode].amount, "Display rounding changed the original wallet API value");
        assert.equal(original.withdrawable, walletDisplayStates[stateMode].amount, "Funds sources disagree on the rounding scenario's canonical amount");
        assert(original.serverCanonical, "Rounding fixture lost its existing source proof");
        record.assertions.push({ id: "rounding-http-source-unchanged", pass: true, evidence: JSON.stringify(original) });
      }
      if (confirmCancel) {
        const bank = route === "pages/me/wallet-withdraw-bank";
        const field = page.locator(`uni-page[data-page="${route}"] input:visible`).first();
        if (!bank) {
          const button = page.locator(`uni-page[data-page="${route}"] .nx-repurchase-submit-cta`).last();
          assert.equal(await button.getAttribute("aria-disabled"), "false", "Purchase confirmation action is disabled");
          await button.click();
          await page.locator(".nx-mask--confirm").waitFor({ state: "visible" });
          dom = await readDOM(page, ".nx-mask--confirm");
        }
        const confirmation = bank ? dom.text : dom.component?.text;
        assert(confirmation && currencyDisplays([{ text: confirmation, class: "confirmation" }]).some(t => t.canonical === "50.12"), "Actual confirmation omitted the two-decimal purchase/withdrawal amount");
        const confirmAmounts = currencyDisplays(dom.monetaryText, "confirmation");
        record.amounts.push(...confirmAmounts);
        for (const token of confirmAmounts) if (!token.canonical) fail(record, `Confirmation ${token.source} amount requires exactly 2 decimals: ${token.text}`);
        record.assertions.push({ id: "real-confirmation-two-decimals", pass: true, evidence: confirmation.slice(0, 1000) });
        await page.locator(bank ? "[data-testid=bank-abandon]" : ".nx-mask--confirm .nx-btn--ghost").click();
        if (!bank) await page.locator(".nx-mask--confirm").waitFor({ state: "detached" });
        await field.waitFor({ state: "visible" });
        await settle(page, state);
        assert.equal(await field.inputValue(), "50.123456", "Cancel/back changed the command amount's six digits");
        record.assertions.push({ id: "cancel-keeps-six-digit-input", pass: true, evidence: "Clicked actual Cancel/back; real input remains 50.123456" });
        const sourcePath = bank ? "/api/withdrawals/bank/config" : "/api/repurchase/orders";
        const sourceResponse = page.waitForResponse(response => new URL(response.url()).pathname === sourcePath && response.request().method() === "GET");
        await page.reload({ waitUntil: "domcontentloaded" });
        await page.waitForFunction(target => [...document.querySelectorAll("uni-page")].some(el => el.dataset.page === target && el.getBoundingClientRect().height > 0) && document.body.innerText.trim().length > 0, route);
        const envelope = await (await sourceResponse).json();
        await settle(page, state);
        if (bank) { await page.locator("[data-testid=bank-continue]").click(); await settle(page, state); }
        const reloaded = await readDOM(page, null);
        assert.equal(reloaded.actualRoute, route, "Reload did not return to the same business page");
        const rawAmount = bank ? envelope.data?.capacity?.maxWithdrawableUsdt : envelope.data?.orders?.[0]?.amountUsdt;
        assert.equal(rawAmount, bank ? 1200.123456 : 50.123456, "Reloaded HTTP source lost six-digit amount precision");
        const reloadedAmounts = currencyDisplays(reloaded.monetaryText, "reload");
        assert(reloadedAmounts.some(t => t.canonical === (bank ? "1200.12" : "50.12")), "Reloaded business data did not keep its two-decimal display");
        record.amounts.push(...reloadedAmounts);
        for (const token of reloadedAmounts) if (!token.canonical) fail(record, `Reload ${token.source} amount requires exactly 2 decimals: ${token.text}`);
        assert(!state.requests.some(r => r.method === "POST" && ["/api/repurchase/orders", "/api/withdrawals", "/api/withdrawals/bank/orders"].includes(r.path)), "Confirmation cancel unexpectedly submitted a financial action");
        record.assertions.push({ id: "same-route-reload-two-decimals-and-six-digit-http", pass: true, evidence: `${sourcePath} amount=${rawAmount}; route=${reloaded.actualRoute}; display=${bank ? "1200.12" : "50.12"}; no financial submission` });
      }
      if (stateMode === "empty") {
        const pass = !dom.component?.text && record.amounts.length === 0 && dom.text.trim().length > 0;
        record.assertions.push({ id: "confirmed-empty-has-no-reward-amount", pass, evidence: dom.text.slice(0, 600) });
        if (!pass) fail(record, "Empty response retained or invented reward amounts");
      }
      if (stateMode === "error") {
        const errorState = await page.locator(`uni-page[data-page="${route}"] [role=alert]`).count();
        const pass = errorState > 0 && record.amounts.length === 0;
        record.assertions.push({ id: "failed-read-is-not-zero-or-success", pass, evidence: dom.text.slice(0, 600) });
        if (!pass) fail(record, "Failed reward read must keep its error/retry and omit invented money");
      }
      record.evidence.push(`Rendered ${route}; ${record.amounts.length} currency displays examined in ${variant.locale}/${variant.theme}/${variant.width}`);
      if (expected) record.componentText = dom.component?.text || dom.text.slice(0, 1200);
      if (shot && report.screenshots.length < 8) {
        const name = `${path.basename(reportPath, ".json")}-${report.runId.slice(0, 12)}-${variant.locale}-${variant.theme}-${variant.width}-${route.replaceAll("/", "-")}-${scenario}.png`;
        const screenshotPath = path.join(output, name);
        if (route === "pages/store/checkout") await page.locator(".promotion-summary.total").scrollIntoViewIfNeeded();
        await page.screenshot({ path: screenshotPath, fullPage: false });
        report.screenshots.push(screenshotPath); record.evidence.push(screenshotPath);
      }
      if (isBoundary) {
        await page.locator(contract.exit).first().click();
        await page.waitForFunction(target => [...document.querySelectorAll("uni-page")].some(el => el.dataset.page === target && el.getBoundingClientRect().height > 0) && (location.hash.slice(2).split("?")[0] || "pages/index/index") === target, contract.exitTarget);
        await settle(page, state);
        const afterExit = await readDOM(page, null);
        assert.equal(afterExit.actualRoute, contract.exitTarget, "H5 boundary exit did not reach its advertised target");
        record.boundaryVerified.exitReached = afterExit.actualRoute;
        record.evidence.push(`Clicked ${contract.exit}; reached ${afterExit.actualRoute}`);
      }
    }
    record.errors = state.errors;
    record.requests = state.requests;
    if (state.errors.length) fail(record, `Browser errors: ${state.errors.map(e => e.message).join(" | ")}`);
    record.status = record.issues.length ? (record.actualRoute !== route && !record.boundaryVerified) || record.assertions.some(a => !a.pass) ? "unverified" : "fail" : "pass";
  } catch (error) {
    record.errors = state.errors; record.requests = state.requests;
    record.failureDOM = await page.evaluate(() => ({ url: location.href, body: document.body.innerText.slice(0, 700), pages: [...document.querySelectorAll("uni-page")].map(el => ({ route: el.dataset.page, height: el.getBoundingClientRect().height })) })).catch(() => null);
    record.failureFrames = page.frames().map(frame => frame.url());
    fail(record, error.stack || String(error), "unverified");
    record.status = "unverified";
    if (interrupted || process.env.WORKFLOW_ABORT_FILE && existsSync(process.env.WORKFLOW_ABORT_FILE)) throw error;
  } finally {
    record.finishedAt = new Date().toISOString();
    report.coverage[scenario === "manifest" ? "visits" : "extraStates"].push(record);
  }
  return record;
}

try {
  boundary();
  await mkdir(output, { recursive: true });
  assert(normTreePath(report.repo) === normTreePath(root), "WORKFLOW_REPO does not name this script's tree");
  if (process.env.BASE_URL) assert(!["5193", "5195"].includes(new URL(process.env.BASE_URL).port), "5193/5195 are existing shared services; use an isolated server");
  server = await ensureServer({ root, environment: "development", reuseUrl: process.env.BASE_URL, timeoutMs: 45000, log: message => console.log(`amount-runtime: ${message}`) });
  report.server = { baseUrl: server.baseUrl, reused: server.reused, identity: await identify(server.baseUrl, { root, environment: "development" }) };
  assert(report.server.identity.ok, report.server.identity.why);
  boundary();
  browser = await chromium.launch({ headless: true });
  async function runVariant(variant) {
    for (const route of routes) await visit(route, variant, { shot: ["pages/store/checkout", "pages/me/wallet"].includes(route) && (smoke || variant.locale === "zh") && variant.theme === "dark" && variant.width === 390 });
    console.log(`amount-runtime: ${variant.locale}/${variant.theme}/${variant.width}: ${routes.length} routes, ${report.coverage.failures.length} failures, ${report.coverage.unverified.length} unverified`);
    // Both wallet rails, ordinary checkout and receipt/reward categories remain
    // reachable without producing real money or changing the DOM.
    for (const extra of [
      { route: "pages/store/checkout", scenario: "ordinary-checkout", query: "product=stellarbox-s1", expected: [null, ["200.00"]] },
      { route: "pages/store/bundle", scenario: "ordinary-bundle", query: "", expected: null },
      { route: "pages/me/rewards-list", scenario: "usdt-reward-records", query: "cat=usdt", expected: [null, ["50.12"]] },
      { route: "pages/me/receipts", scenario: "deposit-receipts", query: "kind=deposit", expected: null },
      { route: "pages/me/wallet-topup", scenario: "crypto-deposit", expected: [null, ["50.00"]] },
      { route: "pages/me/wallet-topup", scenario: "bank-deposit-six-digit-input", input: true, expected: [null, ["5000.00"]] },
      { route: "pages/me/wallet-withdraw-bank", scenario: "bank-confirm-back-reload", input: true, confirmCancel: true, expected: [null, ["50.12", "49.12"]] },
      { route: "pages/me/wallet-withdraw", scenario: "withdraw-six-digit-input", input: true, expected: [null, ["1200.12"]] },
      { route: "pages/me/wallet-exchange", scenario: "exchange-six-digit-input", input: true, expected: [null, ["50.12"]] },
      { route: "pages/me/wallet-repurchase", scenario: "repurchase-confirm-cancel-reload", input: true, confirmCancel: true, expected: [null, ["50.12"]] },
      { route: "pages/events/promotion-rewards", scenario: "confirmed-empty", stateMode: "empty", expected: null },
      { route: "pages/events/promotion-rewards", scenario: "failed-read", stateMode: "error", expected: null },
      ...Object.entries(walletDisplayStates).flatMap(([stateMode, rounding]) => [
        { route: "pages/me/me", scenario: stateMode, stateMode, expected: [".nx-wallet-amount", [rounding.display]] },
        { route: "pages/me/wallet", scenario: stateMode, stateMode, expected: ["uni-text.block.tabular-nums", [rounding.display]] },
      ]),
    ]) await visit(extra.route, variant, extra);
    const { page, state } = await pageFor(variant, true);
    state.mode = "normal";
    boundary();
    const precision = await page.evaluate(async () => {
      const runtimeUrl = performance.getEntriesByType("resource").map(e => e.name).find(name => name.includes("/src/api/runtime.ts")) || "/src/api/runtime.ts";
      const api = await import(runtimeUrl);
      const q = await api.promotionApi.quote([{ productNo: "stellarbox-s1", quantity: 1 }], "money-promo");
      const billPage = await api.walletBillsApi.list();
      const deposits = await api.cregisDepositApi.list();
      return { quote: { subtotalUsdt: q.subtotalUsdt, discountUsdt: q.discountUsdt, amountUsdt: q.amountUsdt }, bills: billPage.bills.map(b => ({ amount: b.amount, amountExact: b.amountExact, balanceAfterExact: b.balanceAfterExact })), deposits: deposits.map(d => ({ grossAmountUsdt: d.grossAmountUsdt, creditedUsdt: d.creditedUsdt })) };
    });
    assert.equal(precision.quote.subtotalUsdt, "200.000000"); assert.equal(precision.quote.discountUsdt, "24.000000"); assert.equal(precision.quote.amountUsdt, "176.000000");
    assert.equal(precision.bills[0].amountExact, "50.123456"); assert.equal(precision.bills[0].balanceAfterExact, "1234.567891");
    assert.equal(precision.deposits[0].grossAmountUsdt, 50.123456);
    report.coverage.extraStates.push({ route: "API readback", ...variant, scenario: "six-digit-authority-preserved", status: "pass", issues: [], evidence: [JSON.stringify(precision)], finishedAt: new Date().toISOString() });
  }
  let nextVariant = 0;
  const lanes = await Promise.allSettled(Array.from({ length: Math.min(6, variants.length) }, async () => {
    try { while (nextVariant < variants.length) { boundary(); await runVariant(variants[nextVariant++]); } }
    catch (error) { interrupted = true; throw error; }
  }));
  const rejected = lanes.find(result => result.status === "rejected");
  if (rejected) throw rejected.reason;
} catch (error) {
  report.fatal = error.stack || String(error);
  console.error(`amount-runtime: ${error.message}`);
} finally {
  await browser?.close();
  server?.stop();
  report.sourceEnd = await snapshot();
  report.treeMoved = before.hash !== report.sourceEnd.hash || before.head !== report.sourceEnd.head;
  report.finishedAt = new Date().toISOString(); report.timestamps.finishedAt = report.finishedAt;
  const completed = report.coverage.visits.filter(r => r.actualRoute === r.route || r.boundaryVerified);
  report.coverage.visitedCombinations = report.coverage.visits.length;
  report.coverage.verifiedCombinations = completed.filter(r => r.status === "pass").length;
  report.coverage.unvisitedRoutes = allRoutes.filter(route => !report.coverage.visits.some(r => r.route === route));
  report.innerSkipped = report.coverage.expectedCombinations - completed.length;
  const evidence = id => [reportPath + "#" + id, `source=${before.hash}; visits=${report.coverage.visits.length}; amounts=${report.coverage.visits.reduce((n, r) => n + r.amounts.length, 0)}`];
  const keyVisits = report.coverage.visits.filter(r => keySurfaces[r.route]);
  report.steps = [
    { id: "money-runtime-all-routes", status: report.innerSkipped === 0 && completed.every(r => r.status === "pass") && !report.fatal ? "pass" : "fail", evidence: evidence("coverage.visits") },
    { id: "money-runtime-key-surfaces", status: Object.keys(keySurfaces).every(route => keyVisits.filter(r => r.route === route && r.status === "pass").length === 12) && report.coverage.extraStates.every(r => r.status === "pass") && !report.fatal ? "pass" : "fail", evidence: evidence("coverage.extraStates") },
    { id: "money-runtime-locales", status: variants.length === 12 && report.coverage.visits.length === allRoutes.length * 12 && completed.every(r => r.status === "pass") && !report.fatal ? "pass" : "fail", evidence: evidence("coverage.locales") },
  ];
  report.verdict = report.mode === "full" && !report.treeMoved && report.steps.every(s => s.status === "pass") ? "pass" : "fail";
  await mkdir(output, { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ verdict: report.verdict, mode: report.mode, report: reportPath, visited: report.coverage.visits.length, expected: report.coverage.expectedCombinations, failures: report.coverage.failures.length, unverified: report.coverage.unverified.length, treeMoved: report.treeMoved }));
  process.exitCode = report.verdict === "pass" ? 0 : 1;
}
