import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import source from './checkout.vue?raw';
import { validatePromotionItems } from '@/api/promotion-api';
import { promotionCheckoutHref,voucherEntryContext } from '@/lib/promotion-entry';
import { formatAmount as formatPlainAmount } from '@/lib/amount-display';
import { zh } from '@/i18n/messages/zh';

const ast=ts.createSourceFile('checkout.ts',parse(source).descriptor.scriptSetup!.content,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
function declarations(names:string[]) {
  const nodes=ast.statements.filter(node=>ts.isFunctionDeclaration(node)&&node.name&&names.includes(node.name.text));
  expect(nodes).toHaveLength(names.length);
  return ts.transpileModule(nodes.map(node=>node.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
}
function screen(overrides:Record<string,unknown>={}) {
  let current=true;
  const scope={accountKey:'user:7',accountEpoch:1,productNo:'real-sku',generation:1};
  const deps={pageAlive:true,pageVisible:true,quantityReady:ref(true),checkoutRouteInitialized:true,activeCheckoutLoad:null,
    promotionRoute:ref(null),product:ref({id:'real-sku'}),purchaseUnavailable:ref(false),step:ref('select-payment'),
    quantitySwitching:ref(false),confirming:false,purchaseConfirmationOpen:false,dialogsOpen:0,
    trialCheckoutSource:false,trialConversionMode:ref(false),appliedTradeinView:ref(null),reAddingTradein:ref(false),
    remoteTradeinRecoveryRequired:ref(false),activeSession:ref(null),resumeSessionId:null,orderId:ref(null),
    remoteOrderFailure:ref(null),receiptWriteFailure:ref(null),captureCheckoutRoute:()=>scope,
    isCurrentCheckoutRoute:()=>current,resumeServerOrder:vi.fn().mockResolvedValue(false),
    readAccountRow:vi.fn(),REMOTE_CHECKOUT_COMMANDS_KEY:'commands',toast:{warn:vi.fn()},t:ref(zh),
    navReplace:vi.fn().mockResolvedValue(true),promotionCheckoutHref,
    goConfirm:vi.fn(),requestConfirmPay:vi.fn(),nextTick:vi.fn(),...overrides};
  const functions=declarations(['canIncreaseCheckoutQuantity','increaseCheckoutQuantity','submitReview']);
  const view=new Function('deps',`with(deps){${functions};return {canIncreaseCheckoutQuantity,increaseCheckoutQuantity,submitReview};}`)(deps);
  return {...deps,...view,leave:()=>{current=false;}};
}

describe('single-item checkout to canonical quantities',()=>{
  it('opens the same checkout with items=2 and prevents a simultaneous payment or duplicate edit',async()=>{
    const page=screen();let finish!:(value:boolean)=>void;
    page.resumeServerOrder.mockImplementationOnce(()=>new Promise<boolean>(resolve=>{finish=resolve;}));
    const edit=page.increaseCheckoutQuantity();
    expect(page.quantitySwitching.value).toBe(true);
    await page.increaseCheckoutQuantity();await page.submitReview();
    expect(page.resumeServerOrder).toHaveBeenCalledOnce();expect(page.requestConfirmPay).not.toHaveBeenCalled();expect(page.goConfirm).not.toHaveBeenCalled();
    finish(false);await edit;
    expect(page.readAccountRow).toHaveBeenCalledWith('commands','user:7',true);
    expect(page.navReplace).toHaveBeenCalledWith(promotionCheckoutHref([{productNo:'real-sku',quantity:2}]));
    expect(page.quantitySwitching.value).toBe(false);
  });
  it.each([
    ['trialCheckoutSource',true],['trialConversionMode',ref(true)],['appliedTradeinView',ref({credit:10})],
    ['remoteTradeinRecoveryRequired',ref(true)],['activeSession',ref({id:'invoice'})],['resumeSessionId','invoice'],
    ['orderId',ref('original')],['remoteOrderFailure',ref('unknown')],['receiptWriteFailure',ref({id:'receipt'})],
    ['confirming',true],['purchaseConfirmationOpen',true],['pageVisible',false],['quantityReady',ref(false)],
  ])('keeps %s in the original transaction flow',async(key,value)=>{
    const page=screen({[key as string]:value});
    expect(page.canIncreaseCheckoutQuantity()).toBe(false);await page.increaseCheckoutQuantity();
    expect(page.navReplace).not.toHaveBeenCalled();expect(page.resumeServerOrder).not.toHaveBeenCalled();
  });
  it('reads back an existing original order instead of changing its quantity',async()=>{
    const page=screen();page.resumeServerOrder.mockResolvedValueOnce(true);await page.increaseCheckoutQuantity();
    expect(page.navReplace).not.toHaveBeenCalled();expect(page.readAccountRow).not.toHaveBeenCalled();
  });
  it('preserves an unresolved durable command even when there is no order receipt yet',async()=>{
    const page=screen();page.readAccountRow.mockReturnValue({commands:{'real-sku||wallet|ordinary':'original-key'}});
    await page.increaseCheckoutQuantity();expect(page.navReplace).not.toHaveBeenCalled();
    expect(page.toast.warn).toHaveBeenCalledWith(zh.store.coRecoverOriginalOrder);
  });
  it('storage failure and account or route changes cannot start another purchase',async()=>{
    const unavailable=screen();unavailable.readAccountRow.mockImplementation(()=>{throw new Error('storage unavailable');});
    await unavailable.increaseCheckoutQuantity();expect(unavailable.navReplace).not.toHaveBeenCalled();
    const stale=screen();stale.resumeServerOrder.mockImplementation(async()=>{stale.leave();return false;});
    await stale.increaseCheckoutQuantity();expect(stale.navReplace).not.toHaveBeenCalled();
  });
});

const loadNode=ast.statements.find(node=>ts.isExpressionStatement(node)&&ts.isCallExpression(node.expression)&&node.expression.expression.getText(ast)==='onLoad') as ts.ExpressionStatement;
const loadSource=(loadNode.expression as ts.CallExpression).arguments[0].getText(ast);
function routeScreen() {
  const deps={takeNavigationQuery:()=>'',voucherEntryContext,promotionRoute:ref(null),validatePromotionItems,t:ref(zh),toast:{warn:vi.fn()},navTo:vi.fn(),URLSearchParams};
  const code=ts.transpileModule('const load='+loadSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  return {...deps,load:new Function('deps',`with(deps){${code};return load;}`)(deps)};
}
it.each([[{productNo:'sku',quantity:2}],[{productNo:'sku',quantity:1},{productNo:'sku2',quantity:3}]])('loads activity-free items without falling into legacy single-item checkout: %j',async(...items)=>{
  const page=routeScreen();await page.load({items:JSON.stringify(items)});
  expect(page.promotionRoute.value).toEqual({activityId:'',items,orderNo:undefined});expect(page.navTo).not.toHaveBeenCalled();
});
it.each(['[]','[{"productNo":"sku","quantity":0}]','broken'])('rejects invalid items rather than purchasing a fallback SKU: %s',async items=>{
  const page=routeScreen();await page.load({items});expect(page.promotionRoute.value).toBeNull();expect(page.toast.warn).toHaveBeenCalled();
});
it.each([[1299,'1,299.00'],['999999999999.995','1,000,000,000,000.00'],[-1299.5,'-1,299.50'],[null,'-']])('groups only the displayed amount %s', (input,expected)=>{
  const display=new Function('formatPlainAmount',declarations(['formatAmount'])+';return formatAmount;')(formatPlainAmount);
  expect(display(input)).toBe(expected);
});

it('a BF20 route preserves coupon and upgrade context without turning the whole shop into an activity scope',async()=>{
  const page=routeScreen();await page.load({product:'ordinary',quantity:'3',voucherId:'BF20',upgradeActivityId:'pro-upgrade',activityId:'unrelated'});
  expect(page.promotionRoute.value).toEqual({activityId:'',items:[{productNo:'ordinary',quantity:3}],orderNo:undefined,voucherId:'BF20',upgradeActivityId:'pro-upgrade'});
});
