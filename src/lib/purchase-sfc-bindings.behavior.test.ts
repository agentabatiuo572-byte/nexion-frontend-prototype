import { expect, it, vi } from 'vitest';
import { ref } from 'vue';
import ts from 'typescript';
import { parse } from '@vue/compiler-sfc';
import promotionSource from '@/components/promotion/promotion-checkout.vue?raw';
import checkoutSource from '@/pages/store/checkout.vue?raw';
import detailSource from '@/pages/store/order-detail.vue?raw';
import bundleSource from '@/pages/store/bundle.vue?raw';
import capacitySource from '@/components/tradein-sheets.vue?raw';
import { selectedPurchasePaymentFixture } from './selected-purchase-payment.test-helper';

function selectedCalls(source: string) {
  const ast = ts.createSourceFile('purchase.vue.ts', parse(source).descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true);
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => { if (ts.isCallExpression(node) && node.expression.getText(ast) === 'executeSelectedPurchase') calls.push(node); ts.forEachChild(node, visit); };
  visit(ast);
  return calls.map(call => ts.transpileModule('return (' + call.getText(ast) + ');', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
}
const promotion = selectedCalls(promotionSource), checkout = selectedCalls(checkoutSource), capacity = selectedCalls(capacitySource);
const kinds = ['ORDER_PAY', 'TRIAL_CONVERT', 'TRADE_IN', 'CAPACITY_REPLACE', 'CAPACITY_KEEP'] as const;
type Kind = typeof kinds[number];
function binding(kind: Kind, amount = 100, ordinaryOrder = false) {
  const authorization = { paymentPassword: '583719', credentialVersion: 3, attemptNo: 'sfc-binding-attempt' };
  const pin = vi.fn(async (_context: unknown, wallet: any, current: () => boolean) => current() ? wallet(authorization) : null);
  const selection = selectedPurchasePaymentFixture(pin);
  const receipt = { orderNo: 'ORDER-ORIGINAL', walletDebitUsdt: 0, paymentStatus: 'PAID', orderStatus: 'COMPLETED' };
  const walletCommand = vi.fn().mockResolvedValue(receipt), acceptExternal = vi.fn().mockResolvedValue(undefined), parseReceipt = vi.fn().mockReturnValue(receipt);
  const key = vi.fn((..._args: unknown[]) => 'original-business-key'), writePending = vi.fn();
  const current = vi.fn(() => true), quote = { sourceDeviceId: 11, sourceRowVersion: 7, targetProductNo: 'sku', payableUsdt: amount, discountUsdt: 20 };
  let code: string, payload: Record<string, unknown>;
  const deps: Record<string, unknown> = { executeSelectedPurchase: selection.execute };
  if (kind === 'ORDER_PAY') {
    payload = { orderNo: 'ORDER-ORIGINAL' };
    if (ordinaryOrder) {
      code = checkout[2];
      Object.assign(deps, { created: { orderNo: 'ORDER-ORIGINAL', amountUsdt: amount }, p: { name: 'Original device' }, paymentCurrent: current,
        beginOrderAction: (...args: unknown[]) => { key(...args); return { key: 'original-business-key' }; },
        submissionScope: { accountKey: 'user:7' }, paymentKey: '', orderApi: { pay: walletCommand },
        asApiError: (error: unknown) => error, clearOrderAction: vi.fn(), paidOrderReceipt: parseReceipt });
    } else {
      code = promotion[0];
      Object.assign(deps, { amountUsdt: String(amount), orderNo: 'ORDER-ORIGINAL', expectedOrder: { items: [{ productName: 'Original device', quantity: 2 }] },
        t: ref({ store: { coConfirmPurchase: 'Confirm' } }), updateClock: vi.fn(), paymentCurrent: current,
        session: { pay: walletCommand, externalPaymentKey: key, acceptExternalPayment: acceptExternal },
        asApiError: (error: unknown) => error, rejection: '' });
    }
  } else if (kind === 'TRIAL_CONVERT') {
    code = checkout[0]; payload = { productNo: 'sku', expectedAmountUsdt: amount, quoteVersion: 'frozen-trial-v7' };
    const converted = { ok: true, orderNo: receipt.orderNo };
    const convert = vi.fn(async (...args: unknown[]) => { if (args.length === 4) return walletCommand(...args); return converted; });
    walletCommand.mockResolvedValue(converted);
    Object.assign(deps, { quotedTotal: amount, p: { id: 'sku', name: 'Original device' }, trialQuote: { quoteVersion: 'frozen-trial-v7' },
      freeTrial: { convert, conversionPaymentKey: key }, isCurrentCheckoutRoute: current, confirmationScope: {}, confirmedAmount: amount,
      netPrice: ref(amount), cardFee: ref(0), confirmedTrialApplied: true, confirmedTrialQuoteVersion: 'frozen-trial-v7',
      trialView: ref({ applied: true, quoteVersion: 'frozen-trial-v7' }), trialQuoteScreenUnavailable: ref(false), parseTrialConvertReceipt: parseReceipt });
  } else if (kind === 'TRADE_IN') {
    code = checkout[1]; payload = { sourceDeviceId: 11, expectedSourceVersion: 7, targetProductNo: 'sku', expectedPayableUsdt: amount, expectedDiscountUsdt: 20 };
    Object.assign(deps, { recovery: { productNo: 'sku', tradeinQuote: quote, commandKey: 'h7-order:original-business-key' }, reviewedQuote: quote,
      product: ref({ name: 'Original device' }), t: ref({ store: { coConfirmPurchase: 'Confirm' } }), authorizationIsCurrent: current,
      deviceE3Api: { submit: walletCommand }, key: 'e3-tradein:original-business-key', parseCanonicalTradeinResult: parseReceipt });
  } else {
    code = capacity[0]; payload = { targetProductNo: 'sku', expectedPayableUsdt: amount, ...(kind === 'CAPACITY_REPLACE' ? { sourceDeviceId: 11 } : {}) };
    Object.assign(deps, { payable: amount, summary: 'Original device', current, effectiveOperation: kind === 'CAPACITY_REPLACE' ? 'replace' : 'keep',
      frozen: quote, target: 'sku', scope: { accountKey: 'user:7' }, requestedIntent: 'original-capacity-intent', intent: 'original-capacity-intent',
      original: null, allowOriginalResume: false, readCapacityPending: vi.fn(() => null), canonicalCapacityKey: key, writeCapacityPending: writePending,
      deviceE3Api: { capacityReplace: walletCommand, capacityKeep: walletCommand, replayCapacityKeep: vi.fn() },
      parseCanonicalTradeinResult: parseReceipt, parseCanonicalCapacityKeepResult: parseReceipt });
  }
  const run = () => new Function(...Object.keys(deps), code)(...Object.values(deps));
  return { run, kind, ordinaryOrder, payload, amount, quote, authorization, selection, pin, walletCommand, acceptExternal, parseReceipt, key, writePending, receipt, current };
}

const surfaces = [...kinds.map(kind => ({ kind, ordinaryOrder: false, label: kind })), { kind: 'ORDER_PAY' as const, ordinaryOrder: true, label: 'ORDINARY_ORDER_PAY' }];
it.each([{name:'checkout',source:checkoutSource},{name:'order detail',source:detailSource},{name:'bundle',source:bundleSource}])('$name actual wallet and external callbacks persist explicit provenance on the same original key',({source})=>{
  const ast=ts.createSourceFile('order.vue.ts',parse(source).descriptor.scriptSetup!.content,ts.ScriptTarget.Latest,true);
  const calls:ts.CallExpression[]=[];
  const visit=(node:ts.Node)=>{if(ts.isCallExpression(node)&&node.expression.getText(ast)==='beginOrderAction'&&node.arguments[1]?.getText(ast)==="'pay'")calls.push(node);ts.forEachChild(node,visit);};visit(ast);
  expect(calls).toHaveLength(2);
  const beginOrderAction=vi.fn(()=>({key:'original-key'}));
  const deps={beginOrderAction,accountKey:'user:7',orders:{currentAccountKey:()=> 'user:7'},submissionScope:{accountKey:'user:7'},created:{orderNo:'ORDER-1',amountUsdt:39.8},requestOrderNo:'ORDER-1',requestAmountUsdt:39.8,command:{expectedAmountUsdt:39.8}};
  for(const call of calls){const code=ts.transpileModule('return '+call.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;expect(new Function(...Object.keys(deps),code)(...Object.values(deps)).key).toBe('original-key');}
  expect(beginOrderAction.mock.calls).toEqual([['user:7','pay','ORDER-1',39.8,'WALLET'],['user:7','pay','ORDER-1',39.8,'EXTERNAL']]);
});
it.each(surfaces)('$label actual SFC binds wallet PIN, authoritative amount/payload and the original command key', async ({ kind, ordinaryOrder }) => {
  const h = binding(kind, 100, ordinaryOrder), pending = h.run();
  expect(h.selection.request).toHaveBeenCalledWith(expect.objectContaining({ kind, payload: h.payload, amount: kind === 'ORDER_PAY' && !ordinaryOrder ? '100' : 100 }));
  expect(h.pin).not.toHaveBeenCalled(); expect(h.walletCommand).not.toHaveBeenCalled();
  await h.selection.wallet(); await pending;
  expect(h.pin).toHaveBeenCalledOnce(); expect(h.walletCommand).toHaveBeenCalledOnce();
  expect(h.walletCommand.mock.calls[0].at(-1)).toEqual(h.authorization);
  const expected = kind === 'ORDER_PAY' ? ordinaryOrder ? ['ORDER-ORIGINAL', 'original-business-key', h.authorization] : [h.authorization]
    : kind === 'TRIAL_CONVERT' ? ['sku', 100, 'frozen-trial-v7', h.authorization]
    : kind === 'TRADE_IN' ? [11, 'sku', 'e3-tradein:original-business-key', h.quote, h.authorization]
    : kind === 'CAPACITY_REPLACE' ? [11, 'sku', 'original-business-key', h.quote, h.authorization]
    : ['sku', 'original-business-key', h.quote, h.authorization];
  expect(h.walletCommand).toHaveBeenCalledExactlyOnceWith(...expected);
  if(ordinaryOrder)expect(h.key).toHaveBeenCalledExactlyOnceWith('user:7','pay','ORDER-ORIGINAL',100,'WALLET');
  expect(h.parseReceipt).not.toHaveBeenCalled(); expect(h.acceptExternal).not.toHaveBeenCalled();
});
it.each(surfaces.flatMap(surface => ['HDPAY_BANK', 'CREGIS_USDT_BSC'].map(method => ({ ...surface, method }))))('$label actual SFC accepts $method receipt without invoking PIN or the wallet command', async ({ kind, ordinaryOrder, method }) => {
  const h = binding(kind, 100, ordinaryOrder), pending = h.run();
  const context = h.selection.request.mock.calls[0][0];
  expect(context).toMatchObject({ kind, payload: h.payload });
  expect(context.commandKey!()).toBe(kind === 'TRADE_IN' ? 'e3-tradein:original-business-key' : 'original-business-key');
  if(ordinaryOrder)expect(h.key).toHaveBeenCalledExactlyOnceWith('user:7','pay','ORDER-ORIGINAL',100,'EXTERNAL');
  const receipt = { ...h.receipt, paymentMethod: method };
  await h.selection.external(receipt); await pending;
  expect(h.pin).not.toHaveBeenCalled(); expect(h.walletCommand).not.toHaveBeenCalled();
  if (kind === 'ORDER_PAY' && !ordinaryOrder) expect(h.acceptExternal).toHaveBeenCalledExactlyOnceWith(receipt);
  else expect(h.parseReceipt).toHaveBeenCalledExactlyOnceWith(receipt);
  expect(h.selection.acknowledge).toHaveBeenCalledWith(expect.objectContaining({ method: 'EXTERNAL', receipt }));
  if (kind.startsWith('CAPACITY_')) expect(h.writePending).toHaveBeenCalledWith('user:7', expect.objectContaining({ key: 'original-business-key' }));
});
it.each(surfaces)('$label actual SFC zero-value rights still require PIN and never open an external collection', async ({ kind, ordinaryOrder }) => {
  const h = binding(kind, 0, ordinaryOrder); await h.run();
  expect(h.selection.request).not.toHaveBeenCalled(); expect(h.pin).toHaveBeenCalledOnce(); expect(h.walletCommand).toHaveBeenCalledOnce();
  expect(h.walletCommand.mock.calls[0].at(-1)).toEqual(h.authorization);
});
it.each(surfaces)('$label actual SFC context invalidation rejects before method selection or PIN', async ({ kind, ordinaryOrder }) => {
  const h = binding(kind, 100, ordinaryOrder); h.current.mockReturnValue(false); await h.run();
  expect(h.selection.request).not.toHaveBeenCalled(); expect(h.pin).not.toHaveBeenCalled(); expect(h.walletCommand).not.toHaveBeenCalled();
});
