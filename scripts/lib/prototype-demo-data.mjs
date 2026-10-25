// Local presentation data. This module is never imported into src or an App build.
// Monetary amounts, hardware specifications and identities below are illustrative.
import { fixture as reviewFixture } from './design-review-fixture.mjs';
import { secondaryDemo } from './prototype-demo-secondary.mjs';
import { withDemoShareChannels } from './prototype-demo-share.mjs';
import { learningDemo } from './prototype-demo-learning.mjs';
import { financeDemo } from './prototype-demo-finance.mjs';
import { rankPolicyDemo } from './prototype-demo-rank-policy.mjs';
import { teamGuidesDemo } from './prototype-demo-team-guides.mjs';
import { auxiliaryDemo } from './prototype-demo-auxiliary.mjs';
import { ambassadorDemo } from './prototype-demo-ambassador.mjs';
import { supportDemo } from './prototype-demo-support.mjs';
import { stakingDemo } from './prototype-demo-staking.mjs';
import { demoNotifications } from './prototype-demo-notifications.mjs';
import { accountDemo } from './prototype-demo-account.mjs';
import { bankDemo } from './prototype-demo-bank.mjs';
import { riskDemo } from './prototype-demo-risk.mjs';

const authority = {sourceEnvironment:'PRODUCTION',runId:'',serverCanonical:true};
const day = 86400000;
const demoStartedAt = Date.now();
const localized = (locale,zh,en,vi) => locale === 'zh' ? zh : locale === 'vi' ? vi : en;
const voucherDiscount=(state,id,total)=>id==='V-DESIGN'&&!state.voucherUsed&&(state.voucherClaimed||['claimed','grace'].includes(state.benefitState))?Math.min(50,total):0;
const bundleRate=count=>count>=4?.11:count===3?.07:count===2?.04:0;
export const demoDefaults = {catalogState:'available',taskState:'pending',eventState:'mixed',raffleState:'normal',pairingState:'pending',benefitState:'available',dataState:'normal',stakingState:'enabled',bankState:'pending',riskState:'accepted',streakState:'normal',ambassadorState:'none',highestRank:false,checkedIn:false,offers:true,messages:true,promotions:true,completed:[],read:false};
export const demoOptions = {
  catalogState:[['phased','完整目录（含即将上线）'],['available','全部 SKU 可购'],['soldout','S1 售罄'],['restricted','购买条件未满足']],
  taskState:[['pending','任务进行中'],['complete','全部完成·待领取'],['claimed','奖励已领取'],['expired','任务已过期'],['empty','暂无任务'],['legacy','任务信息待补全']],
  eventState:[['mixed','全部活动状态'],['available','可参与'],['joined','已参与'],['claimable','奖励待领取'],['claimed','奖励已领取'],['upcoming','即将开始'],['ended','已结束'],['empty','暂无活动']],
  raffleState:[['normal','正常开奖'],['small-usdt','微额 USDT 奖励'],['upcoming','1 分钟后开始'],['ending','1 分钟后截止'],['ended','已截止待开奖']],
  pairingState:[['pending','等待连接'],['connected','配对完成'],['expired','配对已过期']],
  benefitState:[['available','福利待领取'],['claimed','券已领取·试用中'],['grace','试用待抵扣'],['finished','福利已使用']],
  dataState:[['normal','正常数据'],['empty','空数据'],['loading','慢速加载（5 秒）'],['error','加载失败']],
  stakingState:[['enabled','正常开放'],['delisted','功能下架']],
  bankState:[['pending','银行提现 · 处理中'],['settled','银行提现 · 已到账'],['rejected','银行提现 · 已退回']],
  riskState:[['accepted','风险说明 · 已确认'],['unread','风险说明 · 首次阅读']],
  streakState:[['normal','连续签到'],['broken','断签·可使用复活卡']],
  ambassadorState:[['none','尚未申请'],['pending','申请审核中'],['approved','申请已通过'],['rejected','申请未通过']],
};
const skuDefinitions = [
  ['stellarbox-s1','UVELBox S1','Entry',1299,6.2,3,'4 × RTX 4090','96 GB',1200],
  ['stellarbox-pro','UVELBox Pro','Pro',4999,22.4,12,'8 × RTX 4090','192 GB',2400],
  ['stellarbox-pro-v2','UVELBox Pro v2','Pro',5999,28.6,18,'8 × RTX 5090','256 GB',2200],
  ['stellarrack-p1','UVELRack P1','Flagship',12999,45,30,'8 × A100','640 GB',3200],
  ['stellarrack-p2','UVELRack P2','Flagship',19999,75,50,'8 × H100','1,024 GB',4000],
  ['cloud-share','Cloud Share','Share',19.9,0,0,'Distributed','—',0],
];
export function demoProducts(state,origin='http://127.0.0.1:5190',locale='zh') {
  return skuDefinitions.map(([id,name,tier,price,dailyEarn,dailyEarnNEX,gpu,vram,watts],index)=>{
    const share=tier==='Share', upcoming=state.catalogState==='phased'&&[2,4].includes(index);
    return {id,name,tier,price,dailyEarn,dailyEarnNEX,gpu:share?localized(locale,'分布式','Distributed','Phân tán'):gpu,vram,power:watts?watts+' W':null,hashRate:null,
      tagline:localized(locale,['入门款 · 70B 大模型推理','旗舰款 · 训练与 405B 推理','进阶款 · 高性能推理','机架款 · 多任务并行','旗舰机架 · 大型算力作业','云算力 · 灵活参与'][index],['Starter · 70B model inference','Flagship · Training & 405B inference','Advanced · High-performance inference','Rack · Parallel workloads','Flagship rack · Large compute jobs','Cloud compute · Flexible access'][index],['Cơ bản · Suy luận mô hình 70B','Cao cấp · Huấn luyện và suy luận 405B','Nâng cao · Suy luận hiệu năng cao','Máy chủ · Tác vụ song song','Máy chủ cao cấp · Tác vụ tính toán lớn','Điện toán đám mây · Tham gia linh hoạt'][index]),badge:null,imageUrl:new URL(index<2||share?'/static/img/home-glass-20260928/'+(share?'cloud':index===0?'s1':'pro')+'.webp':'/static/img/products/uvel-pedestal/'+id+'.webp',origin).href,
      productType:share?'SHARE':'DEVICE',inventoryMode:share?'UNLIMITED':'FINITE',stock:share?null:state.catalogState==='soldout'&&index===0?0:60-index*7,sold:42+index*13,
      features:[],ai:null,datacenter:localized(locale,'新加坡','Singapore','Singapore'),uptime:'99.9%',warranty:share?undefined:localized(locale,'36 个月','36 months','36 tháng'),status:'active',available:!upcoming,
      releaseState:upcoming?'LOCKED':'RELEASED',releasePhaseId:upcoming?'phase-next':'phase-current',unlocksAtPhase:null,purchaseGate:null,
      ...(share?{shareYieldMin:8,shareYieldMax:12}:{}),
    };
  });
}

const orderStates={placed:['PENDING','PENDING_PAYMENT','WAITING_PAYMENT'],paid:['PAID','PAID','WAITING_PROVISIONING'],provisioning:['PAID','PROCESSING','PROVISIONING'],activated:['PAID','COMPLETED','ACTIVATED'],payment_failed:['FAILED','PAYMENT_FAILED','WAITING_PAYMENT'],expired:['EXPIRED','EXPIRED','WAITING_PAYMENT'],provisioning_failed:['PAID','PROVISIONING_FAILED','PROVISIONING_FAILED'],refunded:['REFUNDED','REFUNDED','REFUNDED'],chargeback:['CHARGEBACK','CHARGEBACK','DEACTIVATED'],cancelled:['CANCELLED','CANCELLED','WAITING_PAYMENT']};
function demoOrders(products,state,now) {
  return Object.entries(orderStates).map(([original,statuses],i)=>{
    const orderNo='DEMO-ORDER-'+String(i+1).padStart(3,'0'),canonicalStatus=state.orderStatuses?.[orderNo]||original;
    const [paymentStatus,orderStatus,activationStatus]=orderStates[canonicalStatus],product=products[i%products.length];
    return {orderNo,productId:i%products.length+1,productNo:product.id,productName:product.name,quantity:1,subtotalUsdt:product.price,unitPriceUsdt:product.price,discountUsdt:0,amountUsdt:product.price,paymentMethod:'WALLET',paymentStatus,orderStatus,activationStatus,canonicalStatus,orderType:'SINGLE',placedAt:now-(i+1)*day,expiresAt:canonicalStatus==='placed'?now+15*60000:canonicalStatus==='expired'?now-day:null,paidAt:['paid','provisioning','activated','provisioning_failed','refunded','chargeback'].includes(canonicalStatus)?now-i*day:null,activatedAt:canonicalStatus==='activated'?now-3600000:null,refundedAt:canonicalStatus==='refunded'?now-3600000:null,refundAmountUsdt:canonicalStatus==='refunded'?product.price:null,refundChannel:canonicalStatus==='refunded'?'WALLET':null,refundBillNo:canonicalStatus==='refunded'?'DEMO-REFUND-1':null,dataCenter:'Singapore',tradeinNo:null,sourceDeviceId:null,targetDeviceId:canonicalStatus==='activated'?41:null,targetDeviceInstanceNo:canonicalStatus==='activated'?'REVIEW-S1':null,itemCount:1};
  });
}

function demoEvents(locale,state,now) {
  if(state.dataState==='empty'||state.eventState==='empty') return [];
  const entries=[
    ['upgrade','discount','设备升级礼','Device upgrade offer','Ưu đãi nâng cấp','AVAILABLE','ongoing',500,'/pages/store/store'],
    ['invite','referral','邀请好友挑战','Invitation challenge','Thử thách mời bạn','JOINED','ongoing',200,'/pages/team/team'],
    ['spin','wheel','每日幸运转盘','Daily lucky spin','Vòng quay mỗi ngày','AVAILABLE','ongoing',50,''],
    ['regional','regional','区域算力挑战','Regional compute challenge','Thử thách khu vực','JOINED','ongoing',300,'/pages/team/leaderboard'],
    ['weekend','boost','周末签到加成','Weekend check-in boost','Thưởng điểm danh cuối tuần','CLAIMABLE','ongoing',20,'/pages/daily/daily'],
    ['season','seasonal','秋季算力季','Autumn compute season','Mùa tính toán thu','AVAILABLE','upcoming',800,'/pages/events/events'],
    ['holding','holding','持有者里程碑','Holder milestone','Cột mốc người nắm giữ','CLAIMED','ended',100,'/pages/me/achievements'],
    ['welcome','onboarding','新用户成长礼','New member rewards','Quà thành viên mới','CLAIMABLE','ongoing',100,'/pages/missions/missions'],
  ];
  return entries.map(([code,kind,zh,en,vi,baseStatus,baseState,rewardAmount,href],i)=>{
    const mode=state.eventState, eventCode='demo-'+code;
    const eventState=['upcoming','ended'].includes(mode)?mode:mode==='mixed'?baseState:'ongoing';
    const userStatus=state.eventStatuses?.[eventCode] || (['available','joined','claimable','claimed'].includes(mode)?mode.toUpperCase():baseStatus);
    return {eventCode,kind,state:eventState,title:localized(locale,zh,en,vi),subtitle:localized(locale,'完成活动条件，查看进度并领取奖励。','Complete the activity goals and claim your reward.','Hoàn thành mục tiêu và nhận thưởng.'),rewardName:'UVT',rewardType:'NEX',rewardAmount,featured:i===0&&eventState==='ongoing',trackable:!['wheel','discount'].includes(kind),targetValue:5,progressValue:['CLAIMABLE','CLAIMED'].includes(userStatus)?5:userStatus==='JOINED'?2:0,userStatus,geo:'GLOBAL',href,startsAt:new Date(eventState==='upcoming'?now+day:now-3*day).toISOString(),endsAt:new Date(eventState==='ended'?now-day:now+7*day).toISOString()};
  });
}

function genesisPublic(now) {
  return {...authority,halted:false,revision:'demo-genesis-1',source:'nx_genesis_series + nx_config_item',
    series:{seriesCode:'genesis-main',name:'Genesis',totalSupply:1000,soldSupply:0,remainingSupply:1000,priceUsdt:9999,royaltyPct:2.5,dailyEmissionRatePct:0},
    sale:{serverCanonical:true,available:false,eligibilityEnabled:true,maxPerUser:2,minAccountAgeDays:0,presaleEnabled:false,showCountdown:false,unitPriceUsdt:9999,open:false,startAt:null,endAt:null},
    market:{enabled:false},emission:{open:false},listings:[],transactions:[],tiers:[{id:'t1',from:0,to:1000,priceUSDT:9999}],tiersVersion:1,marketOpenState:'closed',marketOpenStateVersion:1,showcaseEnabled:true,closedNoticeKey:'default',catalogAvailable:true,tradeAvailable:false,tradeBlockedReason:'SALE_POLICY_UNAVAILABLE',secondaryCommandProtocol:2,
    marketStats:{floorUsdt:null,volume24hUsdt:null,owners:null,floorDeltaPct:null,lastSaleUsdt:null}};
}

/** Mutable state belongs only to the loopback demonstration server. */
export function demoFixture(url,locale,state,request) {
  const now=Date.now(),iso=new Date(now).toISOString(),pathname=url.pathname;
  const empty=state.dataState==='empty';
  const products=demoProducts(state,url.origin,locale);
  const base=(pathnameOverride=pathname)=>reviewFixture(new URL(pathnameOverride,url.origin),locale,state,request);
  const commandKey=request.headers?.()['idempotency-key']||request.headers?.()['Idempotency-Key'];
  const remember=(operation,targetId,response,order)=>{
    if(commandKey){state.commands??={};state.commands[commandKey]={idempotencyKey:commandKey,operation,targetId,status:'SUCCEEDED',order:structuredClone(order),response:structuredClone(response)};}
    return response;
  };
  if(pathname.startsWith('/api/promotion-commands/'))return state.commands?.[decodeURIComponent(pathname.split('/').pop())]||{idempotencyKey:decodeURIComponent(pathname.split('/').pop()),operation:url.searchParams.get('operation'),targetId:url.searchParams.get('targetId'),status:'NOT_FOUND',order:null};
  if(request.method()==='POST'&&commandKey&&state.commands?.[commandKey])return structuredClone(state.commands[commandKey].response);
  if(pathname==='/api/config/platform'){
    const config=structuredClone(base());
    config.featureFlags.stakingVisible=state.stakingState!=='delisted';
    config.featureFlags.homeWeeklyPromoEnabled=true;
    config.share.baseUrl='https://demo.uvel.example/ref/';
    Object.assign(config.publicStats,{registeredUsersBase:12480,registeredUsersAnchorAt:demoStartedAt,registeredUsersTickIntervalSec:30,registeredUsersTickStep:1,virtualUserCount:0});
    if(empty){delete config.publicStats.registeredUsersBase;config.publicStats.networkPulse=null;}
    return withDemoShareChannels(config,state);
  }
  const learning=learningDemo(url,locale,state,request);if(learning!==undefined)return learning;
  const account=accountDemo(url,locale,state,request);if(account!==undefined)return account;
  const bank=bankDemo(url,state,request);if(bank!==undefined)return bank;
  const risk=riskDemo(url,locale,state,request);if(risk!==undefined)return risk;
  if(pathname==='/api/app/home/overview') {
    const overview=structuredClone(base());
    overview.earningsLedger=empty?[]:[['DEMO-EARNING-1','Demo Studio','SDXL',2.34],['DEMO-EARNING-2','Demo Lab','Llama',.00032],['DEMO-EARNING-3','Demo Lab','Whisper',.00005]].map(([id,client,model,rewardUsdt],index)=>({id,client,model,rewardUsdt,completedAt:new Date(now-(index+1)*600000).toISOString(),synthetic:false}));
    return overview;
  }
  if(pathname==='/api/store/bundle-discount')return {source:'server',serverCanonical:true,policyVersion:1,tiers:[{minItems:2,rate:.04},{minItems:3,rate:.07},{minItems:4,rate:.11}]};
  const finance=financeDemo(url,state,request);if(finance!==undefined)return finance;
  const rankPolicy=rankPolicyDemo(url,locale);if(rankPolicy!==undefined)return rankPolicy;
  const teamGuides=teamGuidesDemo(url,locale,request,path=>demoFixture(new URL(path,url.origin),locale,state,request));if(teamGuides!==undefined)return teamGuides;
  const ambassador=ambassadorDemo(url,state,request);if(ambassador!==undefined)return ambassador;
  const auxiliary=auxiliaryDemo(url,locale,state,request);if(auxiliary!==undefined)return auxiliary;
  const staking=stakingDemo(url,state,request);if(staking!==undefined)return staking;
  const support=supportDemo(url,locale,state,request);if(support!==undefined)return support;
  const secondary=secondaryDemo(url,state,request);if(secondary!==undefined)return secondary;
  if(pathname==='/api/config/v-ranks') {
    const data=structuredClone(base());
    const own=[0,320,640,2000,4000,8000,16000,32000,64000],team=[0,1280,6400,20000,64000,160000,480000,1280000,3200000];
    data.ranks=data.ranks.map((rank,index)=>({...rank,cultivationBonus:rank.rewards.filter(reward=>reward.type==='NEX').reduce((sum,reward)=>sum+reward.amount,0),selfComputePoints:own[index],teamComputePoints:team[index]}));
    return data;
  }
  if(pathname==='/api/team/rank') {
    const data=structuredClone(base());
    return {...data,progress:{...data.progress,selfComputePoints:empty?0:state.highestRank?64000:1280,teamComputePoints:empty?0:state.highestRank?3200000:12800}};
  }
  if(pathname==='/api/team/binary')return {...authority,source:'server',runId:null,asOfDate:iso.slice(0,10),trackA:empty?0:2800,trackB:empty?0:2400,trackAComputePoints:empty?0:1720,trackBComputePoints:empty?0:1480,thresholdComputePoints:1000,trackAMembers:empty?0:4,trackBMembers:empty?0:4,autoPlacedMembers:0,matchRate:.1,threshold:1000,dailyCap:5000,periodCap:150000,estimatedAmountUsdt:empty?0:240,settlePeriod:'monthly',residualPolicy:'carryForward',spilloverEnabled:false,gvReset:'monthly',paused:false,blockedReason:empty?'BOTH_TRACKS_BELOW_THRESHOLD':'',recentMatches:empty?[]:[{id:'DEMO-MATCH-1',amountUsdt:120,status:'unlocked',createdAt:new Date(now-day).toISOString(),unlockAt:new Date(now-day).toISOString()}]};
  if(pathname==='/auth/users/oauth/provider/available')return ['GOOGLE','APPLE','TELEGRAM'];
  if(pathname==='/auth/users/oauth/provider/linked')return ['GOOGLE'];
  if(pathname==='/api/store/catalog') return {...authority,source:'nx_product',revision:null,products:empty?[]:products};
  if(pathname==='/api/product/phase') return {phase:'P2',source:'H1_GROWTH_RHYTHM',devOverrideAllowed:false};
  if(pathname==='/api/store/purchase-eligibility') return {...authority,runId:null,productNo:url.searchParams.get('productNo'),eligible:state.catalogState!=='restricted',decisionCode:state.catalogState==='restricted'?'PURCHASE_GATE_NOT_MET':'ELIGIBLE',policies:[{policy:'E1',eligible:state.catalogState!=='restricted',decisionCode:state.catalogState==='restricted'?'PURCHASE_GATE_NOT_MET':'ELIGIBLE',mode:'ALL',conditions:state.catalogState==='restricted'?[{kind:'rank',required:3,current:2,gap:1,met:false}]:[]},{policy:'F4B',eligible:true,decisionCode:'F4B_NOT_CONFIGURED',mode:'ALL',conditions:[]}],evaluatedAt:now,source:'nx_product + nx_admin_device_sku + nx_user'};
  if(pathname==='/api/app/team/quota')return {...authority,source:'server',generatedAt:iso,facts:{rank:state.highestRank?8:2,directRefs:3,directInvites:3,activeDirect:2,teamVolumeUSD:2300},tiers:products.filter(p=>p.productType==='DEVICE').map(p=>({productId:p.id,quotaCode:p.id.toUpperCase(),name:p.name,price:p.price,monthlyStock:60,soldThisMonth:p.sold,unlockKind:'ALL',conditions:[{kind:'teamComputePoints',required:state.catalogState==='restricted'?20000:6400,current:empty?0:12800},...(state.catalogState==='restricted'?[{kind:'rank',required:3,current:2}]:[])],perks:[],available:p.available&&state.catalogState!=='restricted'}))};
  if(pathname==='/api/app/trade-in/config')return {enabled:false,eligibility:'NONE',outputRatioCutsPct:[20,40,60,80],creditRatesPct:[80,60,40,20,10],requireHigherPrice:true,maxDevicesPerOrder:1,earlyAccessEnabled:false,earlyAccessLeadDays:7,source:'server'};
  if(['/api/app/trade-in/eligibility','/api/app/trade-in/capacity-quote'].includes(pathname)){
    const input=request.postDataJSON(),product=products.find(p=>p.id===input.targetProductNo)||products[0],data=structuredClone(base());
    Object.assign(data,{targetProductId:products.indexOf(product)+1,targetProductNo:product.id,targetProductName:product.name,targetPriceUsdt:product.price});
    if(pathname.endsWith('capacity-quote'))Object.assign(data,{activeDevices:2,payableUsdt:product.price,walletBalanceUsdt:state.walletBalance??52800.64,sufficientFunds:(state.walletBalance??52800.64)>=product.price});
    return data;
  }
  if(pathname==='/api/orders/quote') {
    const input=request.postDataJSON();
    const items=input.items.map((item,index)=>{
      const product=products.find(p=>p.id===item.productNo);
      if(!product) throw new Error('Unknown demo SKU');
      return {...item,lineId:'demo-line-'+index,unitPriceUsdt:product.price.toFixed(2),subtotalUsdt:(product.price*item.quantity).toFixed(2),discountUsdt:'0.00',payableUsdt:(product.price*item.quantity).toFixed(2)};
    });
    const subtotal=items.reduce((sum,item)=>sum+Number(item.subtotalUsdt),0).toFixed(2);
    const quote={quoteId:'demo-quote-'+now+'-'+(state.quoteSequence=(state.quoteSequence||0)+1),voucherId:input.voucherId||null,quoteHash:'demo-quote-hash',serverTime:iso,expiresAt:new Date(now+300000).toISOString(),itemCount:items.length,quantity:items.reduce((sum,item)=>sum+item.quantity,0),items,subtotalUsdt:subtotal,discountUsdt:'0.00',amountUsdt:subtotal,bundlePolicyVersion:1,activityId:input.activityId||null,activityVersion:input.activityId?1:null,eligibility:'ELIGIBLE',expectedRewards:[],warnings:[],reserved:false};
    if(input.activityId){const activity=demoFixture(new URL('/api/promotions/'+input.activityId,url.origin),locale,state,request);for(const line of items){const rule=activity.rewardRules?.find(r=>r.productNo===line.productNo);if(rule){const {disclosure,...reward}=rule.buyerReward;quote.expectedRewards.push({lineId:line.lineId,activityId:activity.activityId,version:activity.version,ruleId:rule.ruleId,rewardRuleId:reward.rewardRuleId,beneficiaryRole:reward.beneficiaryRole,groups:1,reward,disclosure,eligibility:'ELIGIBLE',message:null});}}}
    const bundleDiscount=Number((Number(subtotal)*bundleRate(items.length)).toFixed(2));
    let remaining=bundleDiscount+voucherDiscount(state,input.voucherId,Number(subtotal)-bundleDiscount);quote.discountUsdt=remaining.toFixed(2);quote.amountUsdt=(Number(subtotal)-remaining).toFixed(2);
    for(const line of items){const discount=Math.min(remaining,Number(line.subtotalUsdt));line.discountUsdt=discount.toFixed(2);line.payableUsdt=(Number(line.subtotalUsdt)-discount).toFixed(2);remaining-=discount;}
    state.quotes||={};state.quotes[quote.quoteId]=quote;return quote;
  }
  if(pathname==='/api/genesis/state') return url.searchParams.has('history')?{...authority,items:[],nextCursor:null}:genesisPublic(now);
  if(pathname==='/api/genesis/account') return url.searchParams.has('history')?{...authority,items:[],nextCursor:null}:{...authority,series:null,sale:null,eligibility:null,marketEnabled:false,emissionOpen:false,holdings:[],emissions:[],orders:[],walletBalanceUsdt:5280};
  if(pathname==='/api/genesis/eligibility') return {...authority,eligible:false,reasons:['SALE_NOT_OPEN'],ownedCount:0,maxPerUser:2,remainingCap:2,minAccountAgeDays:0,accountAgeDays:42,status:'NOT_ELIGIBLE',reservedAllocation:null,reservedAllocationUnit:'NEX',priorityRank:null,priorityTier:'NONE',qualificationReasonCodes:['NO_ACTIVE_HOLDINGS'],policyVersion:null,effectiveAt:null,asOf:iso,serverTime:iso,provenance:{source:'nx_genesis_holding+nx_config_item',environment:'PRODUCTION',runId:''},halted:false};
  if(pathname==='/api/orders'&&(!request?.method||request.method()==='GET')) return {...authority,runId:null,source:'server',orders:empty?[]:[...(state.createdOrders||[]),...demoOrders(products,state,now)],nextCursor:null};
  if(['/api/orders','/api/orders/bundle'].includes(pathname)&&request.method()==='POST'){
    const input=request.postDataJSON(),quote=state.quotes?.[input.promotionQuoteId];
    const lines=quote?.items||input.items||input.productNos?.map(productNo=>({productNo,quantity:1}))||[{productNo:input.productNo,quantity:input.quantity}],product=products.find(p=>p.id===lines[0].productNo);
    if(lines.some(line=>!products.some(p=>p.id===line.productNo)||!Number.isInteger(line.quantity)||line.quantity<1))throw new Error('Invalid demo order items');
    const quantity=lines.reduce((s,l)=>s+l.quantity,0),subtotal=lines.reduce((s,l)=>s+products.find(p=>p.id===l.productNo).price*l.quantity,0),discountRate=bundleRate(lines.length),bundleDiscount=Number((subtotal*discountRate).toFixed(2)),voucherAmount=voucherDiscount(state,input.voucherId??quote?.voucherId,subtotal-bundleDiscount),amount=Number(quote?.amountUsdt??(subtotal-bundleDiscount-voucherAmount).toFixed(2));
    if(input.productNos&&(input.policyVersion!==1||Math.abs(input.expectedAmountUsdt-amount)>0.000001))throw new Error('Demo bundle quote changed');
    const order={...demoOrders(products,state,now)[0],orderNo:'DEMO-ORDER-'+(state.nextOrderNo=(state.nextOrderNo??now)+1),productNo:product.id,productName:product.name,quantity,subtotalUsdt:subtotal,unitPriceUsdt:product.price,discountUsdt:Number((subtotal-amount).toFixed(6)),amountUsdt:quote?amount.toFixed(2):amount,placedAt:now,orderType:lines.length>1?'BUNDLE':'SINGLE',itemCount:lines.length,lineItems:lines.map(l=>({sku:l.productNo,name:products.find(p=>p.id===l.productNo).name,quantity:l.quantity,unitPriceUsdt:products.find(p=>p.id===l.productNo).price,lineAmountUsdt:products.find(p=>p.id===l.productNo).price*l.quantity}))};
    if(quote)Object.assign(order,{promotionQuoteId:quote.quoteId,payBy:new Date(now+900000).toISOString(),items:quote.items.map(l=>({...l,productName:products.find(p=>p.id===l.productNo).name})),rewards:quote.expectedRewards});
    Object.assign(order,{paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT',activationStatus:'WAITING_PAYMENT',canonicalStatus:'placed',expiresAt:now+900000,paidAt:null,activatedAt:null,targetDeviceId:null,targetDeviceInstanceNo:null});
    if(voucherAmount>0){state.voucherUsed=true;order.voucherId='V-DESIGN';}
    state.createdOrders||=[];state.createdOrders.unshift(order);
    const response=quote?order:input.productNos?{orderNo:order.orderNo,orderType:'BUNDLE',itemCount:lines.length,productNos:input.productNos,subtotalUsdt:subtotal,discountRate,discountUsdt:Number((subtotal-amount).toFixed(6)),amountUsdt:amount,paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT',idSource:'server',policyVersion:1}:{orderNo:order.orderNo,subtotalUsdt:subtotal,discountUsdt:Number((subtotal-amount).toFixed(6)),amountUsdt:amount,voucherId:order.voucherId||null,voucherRedemption:order.voucherId?{voucherId:order.voucherId,grantId:'DEMO-GRANT',status:'REDEEMED',discountUsdt:voucherAmount}:null,paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT',idSource:'server'};
    return remember(lines.length>1?'createBundle':'createOrder',quote?.quoteId||order.orderNo,response,order);
  }
  const orderAction=pathname.match(/^\/api\/orders\/(DEMO-ORDER-\d+)\/(pay|cancel)$/);
  if(orderAction){
    const [,orderNo,action]=orderAction,order=[...(state.createdOrders||[]),...demoOrders(products,state,now)].find(o=>o.orderNo===orderNo);
    if(!order) return {};
    const replay=order.paymentStatus==='PAID';
    if(action==='pay'&&!['PENDING','PAID'].includes(order.paymentStatus)||action==='cancel'&&order.paymentStatus==='PAID')throw new Error('Demo order action unavailable');
    if(action==='pay'&&!replay){if(Number(order.amountUsdt)>(state.walletBalance??52800.64))throw new Error('Insufficient demo balance');state.walletBalance=(state.walletBalance??52800.64)-Number(order.amountUsdt);}
    state.orderStatuses||={};state.orderStatuses[orderNo]=action==='pay'?'activated':'cancelled';
    const canonicalStatus=state.orderStatuses[orderNo],[paymentStatus,orderStatus,activationStatus]=orderStates[canonicalStatus];
    if(state.createdOrders?.includes(order))Object.assign(order,{canonicalStatus,paymentStatus,orderStatus,activationStatus,paymentMethod:Number(order.amountUsdt)===0?'VOUCHER':'WALLET',paidAt:action==='pay'?now:null,activatedAt:action==='pay'?now:null});
    if(action==='cancel')return remember('cancelOrder',orderNo,{...(order.promotionQuoteId?order:{}),...authority,source:'server',orderNo,orderStatus:'CANCELLED',paymentStatus:'CANCELLED',idempotent:false},order);
    const response={...(order.promotionQuoteId?order:{}),...authority,source:'server',orderNo,paymentNo:'DEMO-PAY-'+orderNo,paymentStatus:'PAID',orderStatus:'COMPLETED',activationStatus:'ACTIVATED',canonicalStatus:'activated',amountUsdt:order.promotionQuoteId?Number(order.amountUsdt).toFixed(2):Number(order.amountUsdt),paymentMethod:Number(order.amountUsdt)===0?'VOUCHER':'WALLET',walletBalanceAfterUsdt:Number(order.amountUsdt)===0?null:state.walletBalance??52800.64,idempotent:replay};
    return remember('payOrder',orderNo,response,order);
  }
  if(pathname==='/api/promotions'||/^\/api\/promotions\/demo-promo-\d+$/.test(pathname)) {
    const sample=base('/api/promotions').items[0];
    const configs=[['SKU_GIFT','买 UVELBox S1','Buy UVELBox S1','Mua UVELBox S1','stellarbox-s1'],['FIRST_PURCHASE','首购成长礼','First purchase reward','Quà mua lần đầu','stellarbox-s1'],['DIRECT_REFERRAL','邀请好友购机礼','Referral purchase reward','Quà giới thiệu','stellarbox-pro'],['MULTI_PRODUCT','算力组合礼','Compute bundle offer','Ưu đãi kết hợp','stellarrack-p1'],['REPURCHASE','老用户加购礼','Returning member offer','Ưu đãi mua thêm','cloud-share']];
    const items=empty||state.eventState==='empty'?[]:configs.map(([template,zh,en,vi,productNo],i)=>{
      const item=structuredClone(sample);item.activityId='demo-promo-'+i;item.template=template;item.title={zh,en,vi};item.productNos=template==='MULTI_PRODUCT'?['stellarbox-pro','stellarrack-p1','stellarbox-s1']:[productNo];item.placement=[0,1,4].includes(i)?'home.purchase-promotion':null;
      item.rewardRules[0].productNo=productNo;item.rewardRules[0].ruleId='demo-rule-'+i;
      item.serverTime=iso;
      if(i===0){
        item.endsAt=new Date(now+29*day).toISOString();
        const reward=item.rewardRules[0].buyerReward;reward.giftProductNo='cloud-share';reward.quantity=1;
        reward.disclosure.deviceName='Cloud Share';
        reward.disclosure.benefitDescription={zh:'送 Cloud Share 1 份',en:'Get 1 Cloud Share',vi:'Tặng 1 Cloud Share'};
      }
      if(i>0){const d=item.rewardRules[0].buyerReward.disclosure;d.deviceName=null;d.title={zh:'购机奖励',en:'Purchase reward',vi:'Thưởng mua hàng'};d.benefitDescription={zh:'领取 '+(i*50)+' UVT',en:'Receive '+(i*50)+' UVT',vi:'Nhận '+(i*50)+' UVT'};item.rewardRules[0].buyerReward={rewardRuleId:'demo-reward-'+i,beneficiaryRole:'BUYER',type:'NEX',amount:String(i*50),disclosure:d};}
      if(state.eventState==='upcoming'){item.state='SCHEDULED';item.startsAt=new Date(now+day).toISOString();}else if(state.eventState==='ended'){item.state='ENDED';item.endsAt=new Date(now-day).toISOString();}
      return item;
    });
    if(pathname!=='/api/promotions') return items.find(item=>item.activityId===pathname.split('/').pop())||{};
    const activityId=url.searchParams.get('activityId'),placement=url.searchParams.get('placement');
    return {items:items.filter(item=>(!activityId||item.activityId===activityId)&&(!placement||item.placement===placement)),hasMore:false,nextCursor:null};
  }
  if(pathname==='/api/content/trust/sections/current') {
    const example=localized(locale,'原型演示资料，非真实资质或认证。','Prototype sample, not a real credential or certification.','Dữ liệu mẫu, không phải chứng nhận thực tế.');
    const maps={financials:{overview:example},leadership:{leader1Name:'Alex Chen',leader1Role:localized(locale,'产品负责人（示例）','Product lead (sample)','Trưởng sản phẩm (mẫu)'),leader1Previous:example,leader1Url:'/pages/me/profile'},nexNarrative:{hero:'UVT',subhero:example,hostingContent:localized(locale,'设备托管在专业机房，包含部署、运行监测与日常维护。此处为服务说明演示。','Managed deployment, monitoring and maintenance. Sample service description.','Triển khai, giám sát và bảo trì. Mô tả dịch vụ mẫu.'),warrantyContent:localized(locale,'演示保修期为 36 个月。可通过消息中心联系售后，并查看处理进度。','Sample warranty: 36 months. Contact support in Messages.','Bảo hành mẫu: 36 tháng. Liên hệ hỗ trợ trong Tin nhắn.'),securityContent:localized(locale,'可启用双重验证、管理登录设备并查看账户活动。','Enable two-factor authentication, manage devices and review account activity.','Bật xác thực hai yếu tố, quản lý thiết bị và hoạt động tài khoản.')},complianceBadges:{badge1Label:localized(locale,'合规资料示例','Compliance sample','Mẫu tuân thủ'),badge1Body:example},auditsReserves:{document1Primary:localized(locale,'UVT 介绍（演示）','About UVT (sample)','Giới thiệu UVT (mẫu)'),document1Secondary:localized(locale,'了解 UVT 用途；此资料不是储备证明。','Learn about UVT; this is not proof of reserves.','Tìm hiểu UVT; đây không phải bằng chứng dự trữ.'),document1Url:'/pages/trust/nex',document1Type:'DEMO',document1Date:iso.slice(0,10)},listings:{overview:example}};
    return {...authority,source:'nx_trust_section_version:published',sections:Object.entries(maps).map(([sectionKey,values])=>({sectionKey,version:'v1',description:example,structure:'Published resources',fields:Object.entries(values).map(([key,value])=>({key,label:key,value:empty?'':value}))}))};
  }
  if(pathname==='/api/promotion-rewards'||/^\/api\/promotion-rewards\/demo-reward-\d+$/.test(pathname)){
    const offer=demoFixture(new URL('/api/promotions/demo-promo-0',url.origin),locale,{...state,eventState:'mixed',dataState:'normal'},request),spec=offer.rewardRules[0].buyerReward,{disclosure,...reward}=spec;
    const items=empty?[]:['PENDING','READY','PROCESSING','ISSUED','RETRYABLE_FAILED','OUTCOME_UNKNOWN','CANCELLED','REVERSAL_PENDING','REVERSED','MANUAL_REVIEW'].map((status,i)=>({obligationId:'demo-reward-'+i,orderNo:'DEMO-ORDER-004',activityId:'demo-promo-0',orderLineId:'demo-line-0',updatedAt:iso,reward,disclosure,refundHold:status==='REVERSAL_PENDING',beneficiaryRole:'BUYER',state:status,refundRequestIds:[],assetReceipt:status==='ISSUED'?{deviceIds:[41],instanceNos:['REVIEW-S1'],source:'PROMOTION_GIFT',issuedAt:iso,ledgerBizNo:null,earningsEntryNo:null}:null}));
    if(pathname!=='/api/promotion-rewards')return items.find(r=>r.obligationId===pathname.split('/').pop())||{};
    return {items:items.filter(r=>['state','activityId','orderNo'].every(key=>!url.searchParams.get(key)||r[key]===url.searchParams.get(key))),nextCursor:null,hasMore:false};
  }
  if(/^\/api\/promotions\/demo-promo-\d+\/referral-progress$/.test(pathname))return {activityId:pathname.split('/')[3],qualifyingOrders:2,ownRewards:[],serverTime:iso};
  if(pathname==='/api/app/security/account-deletion')return {status:'NONE'};
  if(pathname==='/api/app/security/phone-number')return {windowDays:30,maxChanges:2,usedChanges:0,remainingChanges:2,nextAvailableAt:iso};
  if(pathname==='/api/quests/state') {
    const data=reviewFixture(url,locale,{...state,taskState:state.dayOneClaimed?'claimed':state.taskState},request);
    if(empty) return {...data,quests:[],dayOneRequiredTaskCount:0,dayOneSnapshotStatus:'EMPTY'};
    const routes=['/pages/me/devices','/pages/store/store','/pages/earn/earn','/pages/learn/courses','/pages/me/profile','/pages/team/team'];
    data.quests.forEach((row,i)=>{row.actionRoute=routes[i];row.category=['identity','explore','explore','explore','identity','social'][i];});
    const weekNames=locale==='zh'?['了解设备收益','完成一门课程','邀请一位好友','查看账户安全']:locale==='vi'?['Tìm hiểu thu nhập','Hoàn thành một bài học','Mời một người bạn','Kiểm tra bảo mật']:['Explore device earnings','Complete one course','Invite a friend','Review account security'];
    if(state.taskState!=='empty') data.quests.push(...weekNames.map((name,i)=>({questCode:'demo-week-'+i,name,layer:i===0?'WEEKLY_T1':'WEEKLY_T2',rewardNex:100+i*25,status:state.weekClaims?.includes(i)?'CLAIMED':state.taskState==='complete'?'CLAIMABLE':state.taskState==='claimed'?'CLAIMED':state.taskState==='expired'?'EXPIRED':i===1?'CLAIMABLE':'PENDING',category:i===2?'social':'explore',actionRoute:['/pages/earn/earn','/pages/learn/courses','/pages/team/team','/pages/me/profile'][i],instanceKey:'WEEK:demo',eligibleFrom:new Date(now-day).toISOString(),eligibleUntil:new Date(now+(state.taskState==='expired'?-1000:5*day)).toISOString(),eligible:!['claimed','expired'].includes(state.taskState)&&!state.weekClaims?.includes(i)})));
    data.promoBanner={bannerCode:'demo-weekly',baseReward:300,multiplier:1,countdownDays:5,countdownHours:0,targetDevice:'UVELBox Pro',targetDaily:22.4,status:'active'};
    return data;
  }
  if(pathname==='/api/content/learning/courses'&&empty)return {...authority,courses:[],completedCourses:0,totalCourses:0,earnedNex:0,rewardTitles:{}};
  const questClaim=pathname.match(/^\/api\/quests\/([^/]+)\/claim$/);
  if(questClaim){const code=decodeURIComponent(questClaim[1]);if(code.startsWith('demo-week-')){state.weekClaims||=[];state.weekClaims.push(Number(code.split('-').pop()));}else state.dayOneClaimed=true;return {...authority,questId:code,rewardNex:code.startsWith('demo-week-')?100+Number(code.split('-').pop())*25:500,status:'CLAIMED',instanceKey:code.startsWith('demo-week-')?'WEEK:demo':'DAY_ONE:design-review'};}
  const events=demoEvents(locale,state,now);
  if(pathname==='/api/events') return {events,serverTimeUtc:iso,source:'nx_event + nx_user_event'};
  const eventRoute=pathname.match(/^\/api\/events\/(demo-[^/]+)\/(detail|join|claim|reminder|spin(?:\/state)?)$/);
  if(eventRoute) {
    const [,id,action]=eventRoute,event=events.find(item=>item.eventCode===id);
    if(!event) return {};
    if(action==='detail') return {event,rules:{description:event.subtitle,terms:localized(locale,'完成对应活动条件即可领取；每个账号限领一次。','Complete the activity goals. One reward per account.','Hoàn thành mục tiêu. Mỗi tài khoản nhận một lần.')},enabled:event.state!=='ended',eligible:event.state==='ongoing',eligibilityReason:event.state==='upcoming'?'NOT_STARTED':event.state==='ended'?'ENDED':event.userStatus==='CLAIMED'?'CLAIMED':event.userStatus==='CLAIMABLE'?'READY':'IN_PROGRESS',progressValue:event.progressValue,targetValue:event.targetValue,rewards:[{type:'NEX',amount:event.rewardAmount}],results:[],userStatus:event.userStatus,claimKeys:[],reminderSubscribed:!!state.reminders?.includes(id)};
    if(action==='join'){state.eventStatuses||={};state.eventStatuses[id]='JOINED';return {eventId:id,status:'JOINED'};}
    if(action==='claim'){state.eventStatuses||={};state.eventStatuses[id]='CLAIMED';return {eventId:id,rewardType:'NEX',rewardAmount:event.rewardAmount,badgeCode:null};}
    if(action==='reminder'){state.reminders||=[];state.reminders.push(id);return {eventId:id,status:'SUBSCRIBED'};}
    const segments=[5,10,20,50,100,200].map((amount,index)=>({tierId:'demo-tier-'+index,rewardType:'NEX',rewardAmount:amount,rewardName:amount+' UVT',realOutflow:false,displayOrder:index}));
    if(action==='spin/state') return {eventCode:id,eventId:id,serverDate:iso.slice(0,10),nextResetAtUtc:new Date(now+day).toISOString(),freeAvailable:!state.spun,bonusTickets:0,availableSpins:state.spun?0:1,segments,history:state.spinHistory||[],source:'nx_event_spin'};
    state.spun=true;const result={spinId:'demo-spin-'+now,eventId:id,spinDate:iso.slice(0,10),sourceType:'DAILY',...segments[2],downgraded:false,downgradeReason:'NONE'};state.spinHistory=[{...result,awardedAt:iso}];return result;
  }
  if(pathname==='/api/points/state') {
    const data=base();
    if(empty) return data;
    const unlocked=state.taskState==='claimed'||state.taskState==='complete';
    if(state.streakState==='broken'&&!state.saverUsed)data.streak={...data.streak,currentStreak:state.checkedIn?1:0,longestStreak:7,streakSavers:state.checkedIn?0:1,lastCheckInDate:new Date(state.checkedIn?now:now-3*day).toISOString().slice(0,10),checkedInToday:!!state.checkedIn};
    if(state.saverUsed)data.streak={...data.streak,currentStreak:state.checkedIn?8:7,longestStreak:state.checkedIn?8:7,streakSavers:0,lastCheckInDate:new Date(state.checkedIn?now:now-day).toISOString().slice(0,10),checkedInToday:!!state.checkedIn};
    data.dailyMilestones=[3,7,14,30].map((milestoneDay,i)=>({milestoneId:i+1,milestoneDay,rewardType:'NEX',rewardAmount:(i+1)*20,badgeCode:null,status:state.milestoneClaims?.includes(i+1)?'CLAIMED':data.streak.currentStreak>=milestoneDay?'CLAIMABLE':'LOCKED'}));
    data.earningMilestones=[10,100,1000].map((amount,i)=>({milestoneId:'demo-earning-'+i,thresholdUsdt:amount,rewardNex:amount,lifetimeEarningsUsdt:128.5,status:i===0||i===1&&state.earningClaimed?'FIRED':i===1?'CLAIMABLE':'LOCKED',achievedAt:i===0||i===1&&state.earningClaimed?iso:null}));
    const names=locale==='zh'?['首次签到','连续签到一周','第一台设备','学习达人','邀请伙伴','算力新星']:locale==='vi'?['Điểm danh đầu tiên','Chuỗi một tuần','Thiết bị đầu tiên','Người học giỏi','Mời bạn bè','Ngôi sao tính toán']:['First check-in','One-week streak','First device','Dedicated learner','Invite a partner','Compute rising star'];
    data.badgeAchievements=names.map((name,i)=>({achievementCode:'demo-achievement-'+i,name,description:name,category:['STREAK','STREAK','EARNING','LEARNING','SOCIAL','EARNING'][i],iconKey:['flame','calendar','cpu','book','users','zap'][i],accentColor:['#9EDC1D','#B47FFF','#FFCB4D'][i%3],rewardPoints:50*(i+1),status:i<2||unlocked?'UNLOCKED':'LOCKED',unlockedAt:i<2||unlocked?iso:null}));
    data.powerUps=[{powerUpId:1,powerUpCode:'demo-checkin-boost',name:localized(locale,'签到加成','Check-in boost','Thưởng điểm danh'),unlockStreakDays:3,targetPath:'/pages/daily/daily',effectType:'CHECKIN_MULTIPLIER',effectValue:'1.5',status:state.powerUp?'ACTIVATED':'AVAILABLE',businessAvailable:true}];
    data.topStreakers=[{name:'Maya',countryCode:'SG',streak:28},{name:'Linh',countryCode:'VN',streak:24},{name:'Alex',countryCode:'JP',streak:14}];
    return data;
  }
  const milestoneClaim=pathname.match(/^\/api\/points\/milestones\/(\d+)\/claim$/);
  if(milestoneClaim){const id=Number(milestoneClaim[1]);state.milestoneClaims||=[];state.milestoneClaims.push(id);return {...authority,milestoneId:id,milestoneDay:[3,7,14,30][id-1],rewardType:'NEX',rewardAmount:id*20,badgeCode:null,spinTickets:0};}
  if(pathname==='/api/points/power-ups/1/activate'){state.powerUp=true;return {...authority,powerUpId:1,powerUpCode:'demo-checkin-boost',badgeCode:null,status:'ACTIVATED'};}
  if(pathname==='/api/points/sign-in'&&(state.saverUsed||state.streakState==='broken')){state.checkedIn=true;return {...authority,checkInDate:iso.slice(0,10),baseNex:5,rewardNex:5,streakBonusNex:0,multiplier:1,streakDays:state.saverUsed?8:1};}
  if(pathname==='/api/points/streak-saver/use'){if(state.streakState!=='broken'||state.saverUsed||state.checkedIn)throw new Error('No interrupted streak to restore');state.saverUsed=true;return {...authority,restoredStreak:7,streakSavers:0,effectiveLastCheckInDate:new Date(now-day).toISOString().slice(0,10)};}
  if(pathname==='/api/earnings/milestones/evaluate'){const fired=state.earningClaimed?[]:[{milestoneId:'demo-earning-1',thresholdUsd:100,rewardNex:100,lifetimeEarningsUsd:128.5}];state.earningClaimed=true;return {...authority,fired,count:fired.length};}
  if(pathname==='/api/app/security') return {twoFactorEnabled:true,passwordChangedAt:iso,sessions:[{id:'demo-session',deviceName:'iPhone · Safari',ipMasked:'192.0.2.*',lastActiveAt:iso,current:true}],nextCursor:null};
  if(pathname==='/api/app/referral-rewards') return {referralCode:'UVELDEMO',rewardEnabled:true,inviterRewardNex:10,invitedCount:12,pendingCount:2,settledCount:10,lifetimeInviterNex:100,walletNexAvailable:1280,limit:10,source:'ledger',sourceEnvironment:'PRODUCTION',runId:null,factSources:['nx_referral_reward_settlement','nx_wallet_ledger','nx_earnings_release_entry','nx_user_wallet'],refreshedAt:iso,recentRewards:empty?[]:[{settlementNo:'DEMO-REF-1',amountNex:10,ledgerStatus:'SUCCESS',balanceAfter:1280,releaseBucket:'withdrawable',sourceEnvironment:'PRODUCTION',settledAt:iso}]};
  if(pathname==='/api/app/team/network') {
    const members=empty?[]:['Maya','Linh','Sam','Rin','Jo','Noah','Mina','Leo'].map((name,i)=>({id:String(100+i),name,avatarUrl:null,vRank:i%4,layer:i<3?1:i<6?2:3,leg:i%2?'A':'B',joinedAt:new Date(now-(40-i)*day).toISOString(),monthVolumeUsdt:300+i*100,lifetimeVolumeUsdt:900+i*300,monthComputePoints:[160,240,320,360,440,480,560,640][i],lifetimeComputePoints:[640,960,1280,1440,1760,1920,2240,2560][i],status:i===6?'OFFLINE':i===7?'IDLE':'ACTIVE',region:['SG','VN','JP'][i%3]}));
    return {...authority,source:'server',generatedAt:iso,totalMembers:members.length,directMembers:empty?0:3,activeMembers:empty?0:6,monthVolumeUsdt:members.reduce((sum,m)=>sum+m.monthVolumeUsdt,0),lifetimeVolumeUsdt:members.reduce((sum,m)=>sum+m.lifetimeVolumeUsdt,0),monthComputePoints:members.reduce((sum,m)=>sum+m.monthComputePoints,0),lifetimeComputePoints:members.reduce((sum,m)=>sum+m.lifetimeComputePoints,0),members,nextCursor:null};
  }
  if(pathname==='/api/devices/earnings') {
    const data=base();data.walletUsdt=empty?0:state.walletBalance??52800.64;data.walletNex=empty?0:1280;data.dailyUsdt=empty?0:28.6;data.dailyNex=empty?0:15;
    data.devices=empty?[]:data.devices.concat({...data.devices[0],id:42,instanceNo:'DEMO-PRO',name:'UVELBox Pro',productCode:'STELLARBOX-PRO',dailyUsdt:22.4,dailyNex:12,todayEarningsUsdt:13.9,todayEarningsNex:2,actualPaidUsdt:4999}).map(device=>({...device,runtimeStatus:'ONLINE'}));
    if(!empty)for(const order of state.createdOrders||[])if(order.canonicalStatus==='activated')for(const [i,line]of order.lineItems.entries())for(let unit=0;unit<line.quantity;unit++){
      const product=products.find(p=>p.id===line.sku),instanceNo=order.orderNo+'-'+i+'-'+unit;
      state.deviceIds??={};state.deviceIds[instanceNo]??=(state.deviceSequence=(state.deviceSequence||1000)+1);
      data.devices.push({...data.devices[0],id:state.deviceIds[instanceNo],instanceNo,name:product.name,productCode:product.id.toUpperCase(),dailyUsdt:product.dailyEarn,dailyNex:product.dailyEarnNEX,actualPaidUsdt:product.price});
    }
    return data;
  }
  if(pathname==='/api/app/wallet/bills'||pathname==='/api/app/wallet/bills/summary') {
    const bills=empty?[]:[['COMPUTE_EARNING','NEX','IN',15,'earn'],['REFERRAL_REWARD','NEX','IN',10,'refer'],['DEVICE_PURCHASE','USDT','OUT',1299,'purchase'],['CHECK_IN','NEX','IN',5,'bonus'],['COMPUTE_EARNING','USDT','IN',128.5,'earn'],['COMPUTE_EARNING','USDT','IN',0.00032,'earn']].map(([bizType,asset,direction,amount,category],i)=>({id:'demo-bill-'+i,bizNo:'DEMO-'+(1000+i),bizType,asset,direction,amount,balanceAfter:asset==='NEX'?1280:5280.64,status:'SUCCESS',remark:'',createdAt:new Date(now-i*day).toISOString(),category}));
    if(pathname.endsWith('/summary')) return {source:'server',sourceEnvironment:'PRODUCTION',timeZone:'UTC',asOf:iso,rewardsUsdt:empty?0:128.5,rewardsNex:empty?0:150,settledRewardsNex:empty?0:140,withdrawalOffsetNexSpent:empty?0:10,latestRewardAt:empty?null:iso,todayNexEarn:empty?0:15,pendingNex:empty?0:10,monthBillCount:bills.length,recentNexBills:bills.filter(b=>b.asset==='NEX')};
    const filtered=bills.filter(bill=>['asset','direction'].every(key=>!url.searchParams.get(key)||url.searchParams.get(key)===bill[key])&&(url.searchParams.get('category')!=='REWARD'||bill.direction==='IN'));
    return {source:'server',sourceEnvironment:'PRODUCTION',bills:filtered,page:1,pageSize:20,total:filtered.length,nextPage:null,nextCursor:null};
  }
  if(pathname==='/api/trial/start') {state.trialStarted=true;return demoFixture(new URL('/api/trial/state',url.origin),locale,state,request);}
  if(pathname==='/api/trial/state'||pathname==='/api/trial/eligibility') {
    const data=structuredClone(reviewFixture(url,locale,{...state,offers:!empty&&state.benefitState!=='finished'},request));
    if(!empty&&(['claimed','grace'].includes(state.benefitState)||state.trialStarted)) Object.assign(data,{state:state.benefitState==='grace'?'GRACE':'ACTIVE',canStart:false,eligibilityReason:'in-progress',claimNo:'DEMO-TRIAL',claimedAtEpochMs:now-day,expiresAtEpochMs:state.benefitState==='grace'?now-1000:now+2*day,graceEndsAtEpochMs:now+7*day,shadowUsdt:12.84,shadowNex:5});
    return data;
  }
  if(pathname==='/api/vouchers') {
    const data=structuredClone(reviewFixture(url,locale,{...state,offers:!empty&&!state.voucherUsed&&state.benefitState!=='finished'},request));
    data.vouchers=data.vouchers.map(v=>({...v,voucherName:localized(locale,'设备代金券','Device voucher','Phiếu giảm giá thiết bị')}));
    if(['claimed','grace'].includes(state.benefitState)||state.voucherClaimed) data.vouchers=data.vouchers.map(v=>({...v,grantId:'DEMO-GRANT',grantStatus:'AVAILABLE',claimable:false,claimedAt:now-day}));
    return data;
  }
  if(pathname==='/api/vouchers/V-DESIGN/claim'){state.voucherClaimed=true;return {...authority,voucherId:'V-DESIGN',grantId:'DEMO-GRANT',status:'AVAILABLE',replay:false,source:'nx_growth_voucher_grant'};}
  if(pathname==='/api/notifications') {
    if(empty) return {items:[],nextCursor:null,unread:0,actionableUnread:0};
    const device=demoFixture(new URL('/api/devices/earnings',url.origin),locale,state,request).devices[0];
    const order=demoOrders(products,state,now).find(item=>item.orderNo==='DEMO-ORDER-002');
    const visibleItems=demoNotifications(locale,state,now,device,order);
    return {items:visibleItems,nextCursor:null,unread:visibleItems.filter(item=>item.readAt===null).length,actionableUnread:visibleItems.filter(item=>item.readAt===null&&item.kind!=='marketing').length};
  }
  if(/^\/api\/notifications\/\d+\/read$/.test(pathname)){state.readIds||=[];state.readIds.push(Number(pathname.split('/')[3]));return null;}
  if(pathname==='/api/notifications/read-all'){const count=demoFixture(new URL('/api/notifications',url.origin),locale,state,request).unread;state.read=true;return count;}
  if(pathname==='/api/notifications/read'){const items=demoFixture(new URL('/api/notifications',url.origin),locale,state,request).items.filter(item=>item.readAt!==null);state.clearedNotificationIds=[...(state.clearedNotificationIds||[]),...items.map(item=>item.id)];return items.length;}
  if(/^\/api\/notifications\/\d+\/actions$/.test(pathname)){
    const id=Number(pathname.split('/')[3]);
    const item=demoFixture(new URL('/api/notifications',url.origin),locale,state,request).items.find(row=>row.id===id);
    if(!item?.ctaHref)throw new Error('DEMO_NOTIFICATION_ACTION_UNAVAILABLE');
    return {notificationId:id,action:request.postDataJSON()?.action||'cta',route:item.ctaHref,recorded:true};
  }
  return base(pathname+url.search);
}
