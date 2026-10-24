import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { Item, OrderReceipt, PublicPromotion, Quote, Reward } from '@/api/promotion-contracts';
import { promotionSeeds } from '@/mock/promotion';
import { buildPromotionQuote } from '@/lib/prototype-promotion-core';
import { useApp } from '@/store/app';
import { useOrders } from '@/store/orders';
import { useBills } from '@/store/bills';
import { useVoucher } from '@/store/voucher';
import { useSponsorship, normalizeRefCode } from '@/store/sponsorship';
import { useVRank } from '@/store/v-rank';
import { useNetwork } from '@/store/network';
import { normalizeAccountKey } from '@/store/account-cloud';
import { readPrototypeStorage, writePrototypeAccountRow } from '@/lib/prototype-storage';
import { createDevice } from '@/store/device-types';
import type { DeviceKind } from '@/store/types';
import { getProduct, evaluatePurchaseGate } from '@/mock/products';
import { computeVoucherDiscount, voucherAppliesToSku } from '@/mock/vouchers';
import { isProductAvailable } from '@/store/product-availability';
import { resolveActivePhase } from '@/store/product-phase';
import { postMoneyBill } from '@/lib/money-receipt';

export type PromotionReward = Reward & { localDeviceIds?: string[] };
export type PromotionOrder = OrderReceipt & { createdAt: number; quote: Quote; voucherId: string | null; deviceIds: string[]; inviterAccount: string | null };
interface Row { activities: PublicPromotion[]; quotes: { value: Quote; voucherId: string | null }[]; orders: PromotionOrder[]; rewards: PromotionReward[]; commands: Record<string, string> }
const KEY = 'nexgrid-promotion-accounts-v1';
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const initial = (): Row => ({ activities: promotionSeeds(), quotes: [], orders: [], rewards: [], commands: {} });
const id = (prefix: string) => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);

export const usePromotion = defineStore('promotion', () => {
  const app = useApp(), bills = useBills(), ordinaryOrders = useOrders(), vouchers = useVoucher();
  const row = ref<Row>(initial());
  const error = ref('');
  let account = '', paying = false;
  function read(key: string): Row {
    const table = readPrototypeStorage<Record<string, Row>>(KEY);
    if (table !== undefined && (!table || typeof table !== 'object' || Array.isArray(table))) throw new Error('storage');
    const value = table && typeof table === 'object' ? table[key] : null;
    if (value && (!Array.isArray(value.orders) || !Array.isArray(value.rewards) || !Array.isArray(value.activities) || !Array.isArray(value.quotes) || !value.commands || typeof value.commands !== 'object')) throw new Error('storage');
    return value ? clone(value) : initial();
  }
  function save(next: Row) {
    if (account !== normalizeAccountKey(app.accountKey)) throw new Error('storage');
    writePrototypeAccountRow(KEY, account, next);
    row.value = clone(next);
  }
  function refresh() {
    const key = normalizeAccountKey(app.accountKey);
    account = key;
    try { row.value = read(key); error.value = ''; } catch { row.value = initial(); error.value = 'storage'; }
  }
  watch(() => app.accountKey, refresh, { immediate: true, flush: 'sync' });
  function ensure() { refresh(); if (error.value) throw new Error(error.value); }
  function withAssets<T>(run: () => T): T {
    return bills.withStrictPrototypeSnapshot(account, () => app.withStrictPrototypeSnapshot(run));
  }
  function checkProducts(items: Item[]) {
    const rank = useVRank(), network = useNetwork();
    const prices: Record<string, number> = {};
    for (const item of items) {
      const product = getProduct(item.productNo);
      if (!product || !isProductAvailable(product, resolveActivePhase(app.user.joinedAt)) || product.purchaseBlocked) throw new Error('unavailable');
      if (evaluatePurchaseGate(product, { rank: rank.myRank, activeDirect: network.members.filter(m => m.layer === 1 && m.status === 'active').length, teamVolumeUSD: rank.teamVolumeUSD }).blocked) throw new Error('ineligible');
      prices[item.productNo] = product.price;
    }
    return prices;
  }
  function firstPurchase() { return !ordinaryOrders.orders.some(o => !['placed', 'cancelled', 'expired', 'payment_failed'].includes(o.status)) && !row.value.orders.some(o => o.paymentStatus === 'PAID' || o.paymentStatus === 'REFUNDED' || bills.bills.some(b => b.ref === o.orderNo && b.type === 'purchase' && b.status === 'posted')); }
  function usedGroups() { const groups: Record<string, number> = {}; for (const order of row.value.orders.filter(o => o.paymentStatus === 'PAID')) for (const reward of order.quote.expectedRewards.filter(r => r.beneficiaryRole === 'BUYER')) groups[reward.ruleId] = (groups[reward.ruleId] ?? 0) + reward.groups; return groups; }
  function quote(items: Item[], activityId: string, voucherId: string | null = null): Quote {
    ensure();
    const activity = row.value.activities.find(a => a.activityId === activityId);
    if (!activity) throw new Error('unavailable');
    const prices = checkProducts(items);
    let discount = 0;
    if (voucherId) {
      const voucher = vouchers.claimedUnused.find(v => v.id === voucherId);
      if (items.length !== 1 || !voucher || !voucherAppliesToSku(voucher, items[0].productNo)) throw new Error('voucher');
      discount = computeVoucherDiscount(voucher, prices[items[0].productNo] * items[0].quantity);
      if (discount <= 0) throw new Error('voucher');
    }
    const result = buildPromotionQuote({ items, activity, prices, firstPurchase: firstPurchase(), invited: !!useSponsorship().sponsorCode, usedGroups: usedGroups(), now: Date.now(), id: id('QUOTE'), discount });
    save({ ...row.value, quotes: [...row.value.quotes.slice(-19), { value: result, voucherId }] });
    return clone(result);
  }
  function resolveInviter(): string | null {
    const code = useSponsorship().sponsorCode;
    if (!code) return null;
    const normalized = normalizeRefCode(code);
    if (!normalized) return null;
    const accounts = readPrototypeStorage<Record<string, { user?: { referralCode?: string } }>>('nexgrid-account-cloud-v1');
    return accounts && typeof accounts === 'object' ? Object.keys(accounts).find(key => key !== account && normalizeRefCode(accounts[key]?.user?.referralCode) === normalized) ?? null : null;
  }
  function project(order: PromotionOrder) {
    const first = order.quote.items[0], name = getProduct(first.productNo)?.name ?? first.productNo;
    const status = order.paymentStatus === 'PAID' ? 'provisioning' : order.paymentStatus === 'REFUNDED' ? 'refunded' : order.paymentStatus === 'CANCELLED' ? 'cancelled' : order.paymentStatus === 'EXPIRED' ? 'expired' : 'placed';
    if (!ordinaryOrders.upsertPromotionOrder({ id: order.orderNo, productId: first.productNo as Exclude<DeviceKind, 'phone'>, productName: name, quantity: order.quantity ?? 1, itemCount: order.quote.itemCount,
      unitPrice: Number(order.quote.subtotalUsdt), discount: Number(order.quote.discountUsdt), total: Number(order.quote.amountUsdt), paymentMethod: 'wallet', status,
      placedAt: order.createdAt, ...(order.paymentStatus === 'PAID' ? { paidAt: order.createdAt } : {}), timeline: [{ status: 'placed', ts: order.createdAt }, ...(order.paymentStatus === 'PAID' ? [{ status: 'paid' as const, ts: order.createdAt }] : [])], dataCenter: 'Singapore DC',
      promotionQuoteId: order.quote.quoteId, activityId: order.quote.activityId ?? '', items: order.items ?? [], deviceIds: order.deviceIds, deviceId: order.deviceIds[0] })) throw new Error('storage');
  }
  function createOrder(quoteId: string, commandKey: string): PromotionOrder {
    ensure(); if (!commandKey.trim()) throw new Error('selection');
    const prior = row.value.orders.find(o => o.orderNo === row.value.commands[commandKey]);
    if (prior) { project(prior); return clone(prior); }
    const saved = row.value.quotes.find(q => q.value.quoteId === quoteId);
    if (!saved || Date.now() >= Date.parse(saved.value.expiresAt)) throw new Error('quoteExpired');
    const q = saved.value; checkProducts(q.items);
    const activity = row.value.activities.find(a => a.activityId === q.activityId);
    if (!activity || activity.state !== 'ACTIVE' || Date.now() >= Date.parse(activity.endsAt)) throw new Error('unavailable');
    if ((activity.template === 'FIRST_PURCHASE' || activity.template === 'DIRECT_REFERRAL') && !firstPurchase()) throw new Error('ineligible');
    const order: PromotionOrder = { orderNo: id('PROMO'), createdAt: Date.now(), orderType: q.itemCount > 1 ? 'BUNDLE' : 'SINGLE', itemCount: q.itemCount, quantity: q.quantity,
      amountUsdt: q.amountUsdt, paymentStatus: 'PENDING', orderStatus: 'PENDING_PAYMENT', payBy: new Date(Date.now() + 30 * 60000).toISOString(), promotionQuoteId: q.quoteId,
      rewards: clone(q.expectedRewards), items: q.items.map(line => ({ ...line, productName: getProduct(line.productNo)?.name ?? line.productNo })), quote: clone(q), voucherId: saved.voucherId, deviceIds: [], inviterAccount: resolveInviter() };
    save({ ...row.value, orders: [order, ...row.value.orders], commands: { ...row.value.commands, [commandKey]: order.orderNo } });
    project(order); return clone(order);
  }
  function obligation(order: PromotionOrder, expected: Quote['expectedRewards'][number], unit: number): PromotionReward {
    return { obligationId: `${order.orderNo}:${expected.lineId}:${expected.rewardRuleId}:${unit}`, activityId: expected.activityId, version: expected.version, orderNo: order.orderNo,
      orderLineId: expected.lineId, ruleId: expected.ruleId, rewardRuleId: expected.rewardRuleId, unitSeq: unit, beneficiaryRole: expected.beneficiaryRole, reward: clone(expected.reward),
      state: 'PENDING', revision: 1, refundHold: false, refundRequestIds: [], assetReceipt: null, recoveredAmount: null, recoveryOutstanding: null, commandId: null, updatedAt: new Date().toISOString(), disclosure: clone(expected.disclosure) };
  }
  function issue(reward: PromotionReward): PromotionReward {
    if (reward.state === 'ISSUED' || ['CANCELLED', 'REVERSED'].includes(reward.state)) return reward;
    if (reward.refundHold || !['PENDING', 'READY', 'RETRYABLE_FAILED'].includes(reward.state)) throw new Error('unavailable');
    const next = clone(reward), spec = reward.reward;
    const receipt = { ledgerBizNo: null as string | null, earningsEntryNo: null, deviceIds: [] as number[], instanceNos: [] as string[], source: spec.type === 'DEVICE' ? 'PROMOTION_GIFT' as const : 'PROMOTION_REWARD' as const, issuedAt: new Date().toISOString() };
    if (spec.type === 'DEVICE') {
      const deviceIds: string[] = [];
      for (let unit = 0; unit < spec.quantity; unit++) {
        const deviceId = `gift:${reward.obligationId}:${unit}`;
        if (!app.restoreDevice(createDevice(spec.giftProductNo as DeviceKind, deviceId, { paidPriceUsdt: 0 }))) throw new Error('storage');
        deviceIds.push(deviceId);
      }
      next.localDeviceIds = deviceIds; receipt.instanceNos = deviceIds;
    } else {
      const existing = bills.bills.find(b => b.ref === reward.obligationId && b.type === 'bonus' && b.symbol === spec.type);
      if (!existing && postMoneyBill({ type: 'bonus', symbol: spec.type, amount: Number(spec.amount), status: 'posted', ref: reward.obligationId, memo: reward.disclosure.title.en }) !== 'ok') throw new Error('storage');
      receipt.ledgerBizNo = reward.obligationId;
    }
    next.assetReceipt = receipt; next.state = 'ISSUED'; next.revision++; return next;
  }
  function completePaid(order: PromotionOrder): PromotionOrder {
    const next = clone(row.value), current = next.orders.find(o => o.orderNo === order.orderNo)!;
    current.paymentStatus = 'PAID'; current.orderStatus = 'COMPLETED';
    for (const line of current.quote.items) for (let unit = 0; unit < line.quantity; unit++) {
      const deviceId = `purchase:${current.orderNo}:${line.lineId}:${unit}`;
      if (!app.restoreDevice(createDevice(line.productNo as DeviceKind, deviceId, { paidPriceUsdt: Number(line.payableUsdt) / line.quantity }))) throw new Error('storage');
      if (!current.deviceIds.includes(deviceId)) current.deviceIds.push(deviceId);
    }
    for (const expected of current.quote.expectedRewards) for (let unit = 0; unit < expected.groups; unit++) {
      const reward = obligation(current, expected, unit);
      if (expected.beneficiaryRole === 'DIRECT_INVITER') {
        if (current.inviterAccount) {
          const inviter = read(current.inviterAccount);
          if (!inviter.rewards.some(r => r.obligationId === reward.obligationId)) {
            inviter.rewards.push(reward);
            writePrototypeAccountRow(KEY, current.inviterAccount, inviter);
          }
        }
        continue;
      }
      const prior = next.rewards.find(r => r.obligationId === reward.obligationId) ?? reward;
      let issued: PromotionReward;
      try { issued = issue(prior); } catch { issued = { ...prior, state: 'RETRYABLE_FAILED' }; }
      next.rewards = [...next.rewards.filter(r => r.obligationId !== reward.obligationId), issued];
    }
    save(next); project(current); return clone(current);
  }
  function payOrder(orderNo: string): PromotionOrder {
    if (paying) throw new Error('busy');
    paying = true;
    try {
      ensure(); return withAssets(() => { const order = row.value.orders.find(o => o.orderNo === orderNo);
      if (!order || ['CANCELLED', 'EXPIRED', 'REFUNDED'].includes(order.paymentStatus)) throw new Error('unavailable');
      // Fulfillment is final. A later retry must not recreate a device already traded in or retired.
      if (order.paymentStatus === 'PAID') { project(order); return clone(order); }
      const charged = bills.bills.some(b => b.ref === orderNo && b.type === 'purchase' && b.status === 'posted');
      if (!charged) {
        if (Date.now() >= Date.parse(order.payBy ?? '')) { const next = clone(row.value); next.orders.find(o => o.orderNo === orderNo)!.paymentStatus = 'EXPIRED'; save(next); project(next.orders.find(o => o.orderNo === orderNo)!); throw new Error('expired'); }
        const activity = row.value.activities.find(a => a.activityId === order.quote.activityId);
        if (!activity || activity.version !== order.quote.activityVersion) throw new Error('unavailable');
        const fresh = buildPromotionQuote({ items: order.quote.items, activity, prices: checkProducts(order.quote.items), firstPurchase: firstPurchase(), invited: !!useSponsorship().sponsorCode, usedGroups: usedGroups(), now: Date.now(), id: order.quote.quoteId, discount: Number(order.quote.discountUsdt) });
        // A second pending order must not spend an entitlement consumed by the first.
        if (JSON.stringify(fresh.expectedRewards) !== JSON.stringify(order.quote.expectedRewards)) throw new Error('ineligible');
        if (order.voucherId && !vouchers.markUsed(order.voucherId)) throw new Error('voucher');
        const draft = { type: 'purchase' as const, symbol: 'USDT' as const, amount: -Number(order.amountUsdt), status: 'posted' as const, ref: orderNo, memo: order.items?.map(i => `${i.productName} ×${i.quantity}`).join(' · ') ?? orderNo };
        const result = Number(order.amountUsdt) === 0 ? (bills.add(draft) ? 'ok' : 'failed') : postMoneyBill(draft);
        if (result !== 'ok') { if (order.voucherId && !vouchers.release(order.voucherId)) throw new Error('storage'); throw new Error(result === 'insufficient' ? 'balanceInsufficient' : 'storage'); }
      }
      return completePaid(order);
      });
    } finally { paying = false; }
  }
  function cancelOrder(orderNo: string): PromotionOrder {
    ensure(); return withAssets(() => { const next = clone(row.value), order = next.orders.find(o => o.orderNo === orderNo);
    if (!order || order.paymentStatus !== 'PENDING' || bills.bills.some(b => b.ref === orderNo && b.type === 'purchase')) throw new Error('unavailable');
    order.paymentStatus = 'CANCELLED'; order.orderStatus = 'CANCELLED'; save(next); project(order); return clone(order);
    });
  }
  function retryReward(obligationId: string) { ensure(); return withAssets(() => { const reward = row.value.rewards.find(r => r.obligationId === obligationId); if (!reward) throw new Error('unavailable'); const issued = issue(reward); save({ ...row.value, rewards: row.value.rewards.map(r => r.obligationId === obligationId ? issued : r) }); }); }
  function getOrder(orderNo: string) { ensure(); return row.value.orders.find(o => o.orderNo === orderNo) ?? null; }
  return { activities: computed(() => row.value.activities), orders: computed(() => row.value.orders), rewards: computed(() => row.value.rewards), error, quote, createOrder, payOrder, cancelOrder, getOrder, retryReward, refresh };
});
