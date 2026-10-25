// Local presentation data. This module is never imported into src or an App build.
// Monetary amounts, hardware specifications and identities below are illustrative.
import { fixture as reviewFixture } from './design-review-fixture.mjs';
import { secondaryDemo } from './prototype-demo-secondary.mjs';

const authority = {sourceEnvironment:'PRODUCTION',runId:'',serverCanonical:true};
const day = 86400000;
const localized = (locale,zh,en,vi) => locale === 'zh' ? zh : locale === 'vi' ? vi : en;
const voucherDiscount=(state,id,total)=>id==='V-DESIGN'&&!state.voucherUsed&&(state.voucherClaimed||['claimed','grace'].includes(state.benefitState))?Math.min(50,total):0;
export const demoDefaults = {catalogState:'available',taskState:'pending',eventState:'mixed',benefitState:'available',dataState:'normal',highestRank:false,checkedIn:false,offers:true,messages:true,promotions:true,completed:[],read:false};
export const demoOptions = {
  catalogState:[['phased','完整目录（含即将上线）'],['available','全部 SKU 可购'],['soldout','S1 售罄'],['restricted','购买条件未满足']],
  taskState:[['pending','任务进行中'],['complete','全部完成·待领取'],['claimed','奖励已领取'],['expired','任务已过期'],['empty','暂无任务'],['legacy','任务信息待补全']],
  eventState:[['mixed','全部活动状态'],['available','可参与'],['joined','已参与'],['claimable','奖励待领取'],['claimed','奖励已领取'],['upcoming','即将开始'],['ended','已结束'],['empty','暂无活动']],
  benefitState:[['available','福利待领取'],['claimed','券已领取·试用中'],['grace','试用待抵扣'],['finished','福利已使用']],
  dataState:[['normal','正常数据'],['empty','空数据'],['loading','慢速加载（5 秒）'],['error','加载失败']],
};
const skuDefinitions = [
  ['stellarbox-s1','UVELBox S1','Entry',1299,6.2,3,'4 × RTX 4090','96 GB',1200],
  ['stellarbox-pro','UVELBox Pro','Pro',4999,22.4,12,'8 × RTX 4090','192 GB',2400],
  ['stellarbox-pro-v2','UVELBox Pro v2','Pro',5999,28.6,18,'8 × RTX 5090','256 GB',2200],
  ['stellarrack-p1','UVELRack P1','Flagship',12999,45,30,'8 × A100','640 GB',3200],
  ['stellarrack-p2','UVELRack P2','Flagship',19999,75,50,'8 × H100','1,024 GB',4000],
  ['cloud-share','Cloud Share','Share',19.9,0,0,'Distributed','—',0],
];
export function demoProducts(state,origin='http://127.0.0.1:5190') {
  return skuDefinitions.map(([id,name,tier,price,dailyEarn,dailyEarnNEX,gpu,vram,watts],index)=>{
    const share=tier==='Share', upcoming=state.catalogState==='phased'&&[2,4].includes(index);
    return {id,name,tier,price,dailyEarn,dailyEarnNEX,gpu,vram,power:watts?watts+' W':null,hashRate:null,
      tagline:'',badge:null,imageUrl:new URL(index<2?'/static/img/home-glass-20260928/'+(index===0?'s1':'pro')+'.webp':'/static/img/products/uvel-v3/'+id+'.png',origin).href,
      productType:share?'SHARE':'DEVICE',inventoryMode:share?'UNLIMITED':'FINITE',stock:share?null:state.catalogState==='soldout'&&index===0?0:60-index*7,sold:42+index*13,
      features:[],ai:null,datacenter:'Singapore',uptime:'99.9%',warranty:'36 months',status:'active',available:!upcoming,
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
  const products=demoProducts(state,url.origin);
  const base=(pathnameOverride=pathname)=>reviewFixture(new URL(pathnameOverride,url.origin),locale,state,request);
  const secondary=secondaryDemo(url,state,request);if(secondary!==undefined)return secondary;
  if(pathname==='/auth/users/oauth/provider/available')return ['GOOGLE','APPLE','TELEGRAM'];
  if(pathname==='/auth/users/oauth/provider/linked')return ['GOOGLE'];
  if(pathname==='/api/store/catalog') return {...authority,source:'nx_product',revision:null,products:empty?[]:products};
  if(pathname==='/api/product/phase') return {phase:'P2',source:'H1_GROWTH_RHYTHM',devOverrideAllowed:false};
  if(pathname==='/api/store/purchase-eligibility') return {...authority,runId:null,productNo:url.searchParams.get('productNo'),eligible:state.catalogState!=='restricted',decisionCode:state.catalogState==='restricted'?'CONDITIONS_NOT_MET':'ELIGIBLE',policies:[{policy:'E1',eligible:true,decisionCode:'ELIGIBLE',mode:'ALL',conditions:[]},{policy:'F4B',eligible:state.catalogState!=='restricted',decisionCode:state.catalogState==='restricted'?'CONDITIONS_NOT_MET':'ELIGIBLE',mode:'ALL',conditions:state.catalogState==='restricted'?[{kind:'rank',required:3,current:2,gap:1,met:false}]:[]}],evaluatedAt:now,source:'nx_product + nx_admin_device_sku + nx_user'};
  if(pathname==='/api/app/team/quota')return {...authority,source:'server',generatedAt:iso,facts:{rank:state.highestRank?8:2,directRefs:3,directInvites:3,activeDirect:2,teamVolumeUSD:2300},tiers:products.filter(p=>p.productType==='DEVICE').map(p=>({productId:p.id,quotaCode:p.id.toUpperCase(),name:p.name,price:p.price,monthlyStock:60,soldThisMonth:p.sold,unlockKind:'ALL',conditions:state.catalogState==='restricted'?[{kind:'rank',required:3,current:2}]:[],perks:[],available:p.available&&state.catalogState!=='restricted'}))};
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
    const quote={quoteId:'demo-quote-'+now,quoteHash:'demo-quote-hash',serverTime:iso,expiresAt:new Date(now+300000).toISOString(),itemCount:items.length,quantity:items.reduce((sum,item)=>sum+item.quantity,0),items,subtotalUsdt:subtotal,discountUsdt:'0.00',amountUsdt:subtotal,bundlePolicyVersion:1,activityId:input.activityId||null,activityVersion:input.activityId?1:null,eligibility:'ELIGIBLE',expectedRewards:[],warnings:[],reserved:false};
    if(input.activityId){const activity=demoFixture(new URL('/api/promotions/'+input.activityId,url.origin),locale,state,request);for(const line of items){const rule=activity.rewardRules?.find(r=>r.productNo===line.productNo);if(rule){const {disclosure,...reward}=rule.buyerReward;quote.expectedRewards.push({lineId:line.lineId,groups:1,reward,disclosure,eligibility:'ELIGIBLE'});}}}
    let remaining=voucherDiscount(state,input.voucherId,Number(subtotal));quote.discountUsdt=remaining.toFixed(2);quote.amountUsdt=(Number(subtotal)-remaining).toFixed(2);
    for(const line of items){const discount=Math.min(remaining,Number(line.subtotalUsdt));line.discountUsdt=discount.toFixed(2);line.payableUsdt=(Number(line.subtotalUsdt)-discount).toFixed(2);remaining-=discount;}
    state.quotes||={};state.quotes[quote.quoteId]=quote;return quote;
  }
  if(pathname==='/api/genesis/state') return url.searchParams.has('history')?{...authority,items:[],nextCursor:null}:genesisPublic(now);
  if(pathname==='/api/genesis/account') return url.searchParams.has('history')?{...authority,items:[],nextCursor:null}:{...authority,series:null,sale:null,eligibility:null,marketEnabled:false,emissionOpen:false,holdings:[],emissions:[],orders:[],walletBalanceUsdt:5280};
  if(pathname==='/api/genesis/eligibility') return {...authority,eligible:false,reasons:['SALE_NOT_OPEN'],ownedCount:0,maxPerUser:2,remainingCap:2,minAccountAgeDays:0,accountAgeDays:42,status:'NOT_ELIGIBLE',reservedAllocation:null,reservedAllocationUnit:'NEX',priorityRank:null,priorityTier:'NONE',qualificationReasonCodes:['NO_ACTIVE_HOLDINGS'],policyVersion:null,effectiveAt:null,asOf:iso,serverTime:iso,provenance:{source:'nx_genesis_holding+nx_config_item',environment:'PRODUCTION',runId:''},halted:false};
  if(pathname==='/api/config/platform') {
    const data=structuredClone(base());
    data.featureFlags.homeWeeklyPromoEnabled=true;
    data.share.baseUrl='https://demo.uvel.example/ref/';
    return data;
  }
  if(pathname==='/api/orders'&&(!request?.method||request.method()==='GET')) return {...authority,runId:null,source:'server',orders:empty?[]:[...(state.createdOrders||[]),...demoOrders(products,state,now)],nextCursor:null};
  if(['/api/orders','/api/orders/bundle'].includes(pathname)&&request.method()==='POST'){
    const input=request.postDataJSON(),quote=state.quotes?.[input.promotionQuoteId];
    const lines=quote?.items||input.items||[{productNo:input.productNo,quantity:input.quantity}],product=products.find(p=>p.id===lines[0].productNo);
    const quantity=lines.reduce((s,l)=>s+l.quantity,0),subtotal=lines.reduce((s,l)=>s+products.find(p=>p.id===l.productNo).price*l.quantity,0),amount=Number(quote?.amountUsdt??subtotal-voucherDiscount(state,input.voucherId,subtotal));
    const order={...demoOrders(products,state,now)[0],orderNo:'DEMO-ORDER-'+now,productNo:product.id,productName:product.name,quantity,subtotalUsdt:subtotal,unitPriceUsdt:product.price,discountUsdt:subtotal-amount,amountUsdt:quote?amount.toFixed(2):amount,placedAt:now,orderType:lines.length>1?'BUNDLE':'SINGLE',itemCount:lines.length,lineItems:lines.map(l=>({sku:l.productNo,name:products.find(p=>p.id===l.productNo).name,quantity:l.quantity,unitPriceUsdt:products.find(p=>p.id===l.productNo).price,lineAmountUsdt:products.find(p=>p.id===l.productNo).price*l.quantity}))};
    if(quote)Object.assign(order,{promotionQuoteId:quote.quoteId,payBy:new Date(now+900000).toISOString(),items:quote.items.map(l=>({...l,productName:products.find(p=>p.id===l.productNo).name})),rewards:quote.expectedRewards});
    Object.assign(order,{paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT',activationStatus:'WAITING_PAYMENT',canonicalStatus:'placed',expiresAt:now+900000,paidAt:null,activatedAt:null,targetDeviceId:null,targetDeviceInstanceNo:null});
    if(subtotal>amount){state.voucherUsed=true;order.voucherId='V-DESIGN';}
    state.createdOrders||=[];state.createdOrders.unshift(order);
    return quote?order:{orderNo:order.orderNo,subtotalUsdt:subtotal,discountUsdt:subtotal-amount,amountUsdt:amount,voucherId:order.voucherId||null,voucherRedemption:order.voucherId?{voucherId:order.voucherId,grantId:'DEMO-GRANT',status:'REDEEMED',discountUsdt:subtotal-amount}:null,paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT',idSource:'server'};
  }
  const orderAction=pathname.match(/^\/api\/orders\/(DEMO-ORDER-\d+)\/(pay|cancel)$/);
  if(orderAction){
    const [,orderNo,action]=orderAction,order=[...(state.createdOrders||[]),...demoOrders(products,state,now)].find(o=>o.orderNo===orderNo);
    if(!order) return {};
    const replay=order.paymentStatus==='PAID';
    if(action==='pay'&&!replay){if(Number(order.amountUsdt)>(state.walletBalance??52800.64))throw new Error('Insufficient demo balance');state.walletBalance=(state.walletBalance??52800.64)-Number(order.amountUsdt);}
    state.orderStatuses||={};state.orderStatuses[orderNo]=action==='pay'?'activated':'cancelled';
    const canonicalStatus=state.orderStatuses[orderNo],[paymentStatus,orderStatus,activationStatus]=orderStates[canonicalStatus];
    if(state.createdOrders?.includes(order))Object.assign(order,{canonicalStatus,paymentStatus,orderStatus,activationStatus,paymentMethod:Number(order.amountUsdt)===0?'VOUCHER':'WALLET',paidAt:action==='pay'?now:null,activatedAt:action==='pay'?now:null});
    if(action==='cancel')return {...authority,source:'server',orderNo,orderStatus:'CANCELLED',paymentStatus:'CANCELLED',idempotent:false};
    return {...authority,source:'server',orderNo,paymentNo:'DEMO-PAY-'+orderNo,paymentStatus:'PAID',orderStatus:'COMPLETED',activationStatus:'ACTIVATED',canonicalStatus:'activated',amountUsdt:Number(order.amountUsdt),paymentMethod:Number(order.amountUsdt)===0?'VOUCHER':'WALLET',walletBalanceAfterUsdt:Number(order.amountUsdt)===0?null:state.walletBalance??52800.64,idempotent:replay};
  }
  if(pathname==='/api/promotions'||/^\/api\/promotions\/demo-promo-\d+$/.test(pathname)) {
    const sample=base('/api/promotions').items[0];
    const configs=[['SKU_GIFT','设备升级礼','Device upgrade gift','Quà nâng cấp','stellarbox-pro'],['FIRST_PURCHASE','首购成长礼','First purchase reward','Quà mua lần đầu','stellarbox-s1'],['DIRECT_REFERRAL','邀请好友购机礼','Referral purchase reward','Quà giới thiệu','stellarbox-pro'],['MULTI_PRODUCT','算力组合礼','Compute bundle offer','Ưu đãi kết hợp','stellarrack-p1'],['REPURCHASE','老用户加购礼','Returning member offer','Ưu đãi mua thêm','cloud-share']];
    const items=empty||state.eventState==='empty'?[]:configs.map(([template,zh,en,vi,productNo],i)=>{
      const item=structuredClone(sample);item.activityId='demo-promo-'+i;item.template=template;item.title={zh,en,vi};item.productNos=[productNo];item.placement=i===0?'home.purchase-promotion':null;
      item.rewardRules[0].productNo=productNo;item.rewardRules[0].ruleId='demo-rule-'+i;
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
    const maps={financials:{overview:example},leadership:{leader1Name:'Alex Chen',leader1Role:localized(locale,'产品负责人（示例）','Product lead (sample)','Trưởng sản phẩm (mẫu)'),leader1Previous:example,leader1Url:'/pages/me/profile'},nexNarrative:{hero:'UVT',subhero:example,hostingContent:localized(locale,'设备托管在专业机房，包含部署、运行监测与日常维护。此处为服务说明演示。','Managed deployment, monitoring and maintenance. Sample service description.','Triển khai, giám sát và bảo trì. Mô tả dịch vụ mẫu.'),warrantyContent:localized(locale,'演示保修期为 36 个月。可通过消息中心联系售后，并查看处理进度。','Sample warranty: 36 months. Contact support in Messages.','Bảo hành mẫu: 36 tháng. Liên hệ hỗ trợ trong Tin nhắn.'),securityContent:localized(locale,'可启用双重验证、管理登录设备并查看账户活动。','Enable two-factor authentication, manage devices and review account activity.','Bật xác thực hai yếu tố, quản lý thiết bị và hoạt động tài khoản.')},complianceBadges:{badge1Label:localized(locale,'合规资料示例','Compliance sample','Mẫu tuân thủ'),badge1Body:example},auditsReserves:{document1Primary:localized(locale,'储备说明（演示）','Reserve disclosure (sample)','Công bố dự trữ (mẫu)'),document1Secondary:example,document1Url:'/pages/trust/nex',document1Type:'DEMO',document1Date:iso.slice(0,10)},listings:{overview:example}};
    return {...authority,source:'nx_trust_section_version:published',sections:Object.entries(maps).map(([sectionKey,values])=>({sectionKey,version:'v1',description:example,structure:'Published resources',fields:Object.entries(values).map(([key,value])=>({key,label:key,value:empty?'':value}))}))};
  }
  if(pathname==='/api/promotion-rewards'||/^\/api\/promotion-rewards\/demo-reward-\d+$/.test(pathname)){
    const offer=base('/api/promotions').items[0],spec=offer.rewardRules[0].buyerReward,{disclosure,...reward}=spec;
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
    data.dailyMilestones=[3,7,14,30].map((milestoneDay,i)=>({milestoneId:i+1,milestoneDay,rewardType:'NEX',rewardAmount:(i+1)*20,badgeCode:null,status:state.milestoneClaims?.includes(i+1)?'CLAIMED':i===0&&state.checkedIn?'CLAIMABLE':'LOCKED'}));
    data.earningMilestones=[10,100,1000].map((amount,i)=>({milestoneId:'demo-earning-'+i,thresholdUsdt:amount,rewardNex:amount,lifetimeEarningsUsdt:128.5,status:i===0?'FIRED':i===1?'CLAIMABLE':'LOCKED',achievedAt:i<2?iso:null}));
    const names=locale==='zh'?['首次签到','连续签到一周','第一台设备','学习达人','邀请伙伴','算力新星']:locale==='vi'?['Điểm danh đầu tiên','Chuỗi một tuần','Thiết bị đầu tiên','Người học giỏi','Mời bạn bè','Ngôi sao tính toán']:['First check-in','One-week streak','First device','Dedicated learner','Invite a partner','Compute rising star'];
    data.badgeAchievements=names.map((name,i)=>({achievementCode:'demo-achievement-'+i,name,description:name,category:['STREAK','STREAK','EARNING','LEARNING','SOCIAL','EARNING'][i],iconKey:['flame','calendar','cpu','book','users','zap'][i],accentColor:['#9EDC1D','#B47FFF','#FFCB4D'][i%3],rewardPoints:50*(i+1),status:i<2||unlocked?'UNLOCKED':'LOCKED',unlockedAt:i<2||unlocked?iso:null}));
    data.powerUps=[{powerUpId:1,powerUpCode:'demo-checkin-boost',name:localized(locale,'签到加成','Check-in boost','Thưởng điểm danh'),unlockStreakDays:3,targetPath:'/pages/daily/daily',effectType:'CHECKIN_MULTIPLIER',effectValue:'1.5',status:state.powerUp?'ACTIVATED':'AVAILABLE',businessAvailable:true}];
    data.topStreakers=[{name:'Maya',countryCode:'SG',streak:28},{name:'Linh',countryCode:'VN',streak:24},{name:'Alex',countryCode:'JP',streak:14}];
    return data;
  }
  const milestoneClaim=pathname.match(/^\/api\/points\/milestones\/(\d+)\/claim$/);
  if(milestoneClaim){const id=Number(milestoneClaim[1]);state.milestoneClaims||=[];state.milestoneClaims.push(id);return {...authority,milestoneId:id,milestoneDay:[3,7,14,30][id-1],rewardType:'NEX',rewardAmount:id*20,badgeCode:null,spinTickets:0};}
  if(pathname==='/api/points/power-ups/1/activate'){state.powerUp=true;return {...authority,powerUpId:1,powerUpCode:'demo-checkin-boost',badgeCode:null,status:'ACTIVATED'};}
  if(pathname==='/api/app/profile') return {nickname:'Alex',avatarUrl:'',avatarRevision:'',language:locale};
  if(pathname==='/api/app/security') return {twoFactorEnabled:true,passwordChangedAt:iso,sessions:[{id:'demo-session',deviceName:'iPhone · Safari',ipMasked:'192.0.2.*',lastActiveAt:iso,current:true}],nextCursor:null};
  if(pathname==='/api/app/referral-rewards') return {referralCode:'UVEL-DEMO',rewardEnabled:true,inviterRewardNex:10,invitedCount:12,pendingCount:2,settledCount:10,lifetimeInviterNex:100,walletNexAvailable:1280,limit:10,source:'ledger',sourceEnvironment:'PRODUCTION',runId:null,factSources:['nx_referral_reward_settlement','nx_wallet_ledger','nx_earnings_release_entry','nx_user_wallet'],refreshedAt:iso,recentRewards:empty?[]:[{settlementNo:'DEMO-REF-1',amountNex:10,ledgerStatus:'SUCCESS',balanceAfter:1280,releaseBucket:'withdrawable',sourceEnvironment:'PRODUCTION',settledAt:iso}]};
  if(pathname==='/api/app/team/network') {
    const members=empty?[]:['Maya','Linh','Sam','Rin','Jo','Noah','Mina','Leo'].map((name,i)=>({id:String(100+i),name,avatarUrl:null,vRank:i%4,layer:i<3?1:i<6?2:3,leg:i%2?'A':'B',joinedAt:new Date(now-(40-i)*day).toISOString(),monthVolumeUsdt:300+i*100,lifetimeVolumeUsdt:900+i*300,status:i===6?'OFFLINE':i===7?'IDLE':'ACTIVE',region:['SG','VN','JP'][i%3]}));
    return {...authority,source:'server',generatedAt:iso,totalMembers:members.length,directMembers:empty?0:3,activeMembers:empty?0:6,monthVolumeUsdt:members.reduce((sum,m)=>sum+m.monthVolumeUsdt,0),lifetimeVolumeUsdt:members.reduce((sum,m)=>sum+m.lifetimeVolumeUsdt,0),members,nextCursor:null};
  }
  if(pathname==='/api/devices/earnings') {
    const data=base();data.walletUsdt=empty?0:state.walletBalance??52800.64;data.walletNex=empty?0:1280;data.dailyUsdt=empty?0:28.6;data.dailyNex=empty?0:15;
    data.devices=empty?[]:data.devices.concat({...data.devices[0],id:42,instanceNo:'DEMO-PRO',name:'UVELBox Pro',productCode:'STELLARBOX-PRO',dailyUsdt:22.4,dailyNex:12,todayEarningsUsdt:13.9,todayEarningsNex:2,actualPaidUsdt:4999}).map(device=>({...device,runtimeStatus:'ONLINE'}));
    if(!empty)for(const order of state.createdOrders||[])if(order.canonicalStatus==='activated')for(const [i,line]of order.lineItems.entries())for(let unit=0;unit<line.quantity;unit++){const product=products.find(p=>p.id===line.sku);data.devices.push({...data.devices[0],id:Number(String(order.orderNo).replace('DEMO-ORDER-',''))+i*100+unit,instanceNo:order.orderNo+'-'+i+'-'+unit,name:product.name,productCode:product.id.toUpperCase(),dailyUsdt:product.dailyEarn,dailyNex:product.dailyEarnNEX,actualPaidUsdt:product.price});}
    return data;
  }
  if(pathname==='/api/app/wallet/bills'||pathname==='/api/app/wallet/bills/summary') {
    const bills=empty?[]:[['COMPUTE_EARNING','NEX','IN',15,'earn'],['REFERRAL_REWARD','NEX','IN',10,'refer'],['DEVICE_PURCHASE','USDT','OUT',1299,'purchase'],['CHECK_IN','NEX','IN',5,'bonus']].map(([bizType,asset,direction,amount,category],i)=>({id:'demo-bill-'+i,bizNo:'DEMO-'+(1000+i),bizType,asset,direction,amount,balanceAfter:asset==='NEX'?1280:5280.64,status:'SUCCESS',remark:'',createdAt:new Date(now-i*day).toISOString(),category}));
    if(pathname.endsWith('/summary')) return {source:'server',sourceEnvironment:'PRODUCTION',timeZone:'UTC',asOf:iso,rewardsUsdt:empty?0:128.5,rewardsNex:empty?0:150,settledRewardsNex:empty?0:140,withdrawalOffsetNexSpent:empty?0:10,latestRewardAt:empty?null:iso,todayNexEarn:empty?0:15,pendingNex:empty?0:10,monthBillCount:bills.length,recentNexBills:bills.filter(b=>b.asset==='NEX')};
    return {source:'server',sourceEnvironment:'PRODUCTION',bills,page:1,pageSize:20,total:bills.length,nextPage:null,nextCursor:null};
  }
  if(pathname==='/api/trial/start') {state.trialStarted=true;return demoFixture(new URL('/api/trial/state',url.origin),locale,state,request);}
  if(pathname==='/api/trial/state'||pathname==='/api/trial/eligibility') {
    const data=structuredClone(reviewFixture(url,locale,{...state,offers:!empty&&state.benefitState!=='finished'},request));
    if(!empty&&(['claimed','grace'].includes(state.benefitState)||state.trialStarted)) Object.assign(data,{state:state.benefitState==='grace'?'GRACE':'ACTIVE',canStart:false,eligibilityReason:'in-progress',claimNo:'DEMO-TRIAL',claimedAtEpochMs:now-day,expiresAtEpochMs:state.benefitState==='grace'?now-1000:now+2*day,graceEndsAtEpochMs:now+7*day,shadowUsdt:12.84,shadowNex:5});
    return data;
  }
  if(pathname==='/api/vouchers') {
    const data=structuredClone(reviewFixture(url,locale,{...state,offers:!empty&&!state.voucherUsed&&state.benefitState!=='finished'},request));
    if(['claimed','grace'].includes(state.benefitState)||state.voucherClaimed) data.vouchers=data.vouchers.map(v=>({...v,grantId:'DEMO-GRANT',grantStatus:'AVAILABLE',claimable:false,claimedAt:now-day}));
    return data;
  }
  if(pathname==='/api/vouchers/V-DESIGN/claim'){state.voucherClaimed=true;return {...authority,voucherId:'V-DESIGN',grantId:'DEMO-GRANT',status:'AVAILABLE',replay:false,source:'nx_growth_voucher_grant'};}
  if(pathname==='/api/notifications') {
    if(empty) return {items:[],nextCursor:null,unread:0};
    const titles=locale==='zh'?['设备已开始运行','订单支付成功','新手奖励待领取','限时设备升级礼','服务维护已完成']:locale==='vi'?['Thiết bị đang chạy','Thanh toán thành công','Nhận thưởng thành viên mới','Ưu đãi nâng cấp','Bảo trì hoàn tất']:['Device is running','Payment successful','Newcomer reward ready','Device upgrade offer','Maintenance complete'];
    const items=titles.map((title,i)=>({id:901+i,kind:['system','order','reward','marketing','system'][i],priority:i===2?'high':'normal',title,body:localized(locale,'查看详情，了解当前状态与下一步。','View details for the current status and next steps.','Xem chi tiết trạng thái và bước tiếp theo.'),ctaLabel:i===4?'':localized(locale,'查看详情','View details','Xem chi tiết'),ctaHref:['/pages/me/devices','/pages/store/orders','/pages/missions/missions','/pages/store/store',''][i],createdAt:now-i*3600000,readAt:state.read||state.readIds?.includes(901+i)||i>=3?now:null}));
    const visibleItems=items.filter(item=>!state.clearedNotificationIds?.includes(item.id));
    return {items:visibleItems,nextCursor:null,unread:visibleItems.filter(item=>item.readAt===null).length};
  }
  if(/^\/api\/notifications\/\d+\/read$/.test(pathname)){state.readIds||=[];state.readIds.push(Number(pathname.split('/')[3]));return null;}
  if(pathname==='/api/notifications/read-all'){const count=demoFixture(new URL('/api/notifications',url.origin),locale,state,request).unread;state.read=true;return count;}
  if(pathname==='/api/notifications/read'){const items=demoFixture(new URL('/api/notifications',url.origin),locale,state,request).items.filter(item=>item.readAt!==null);state.clearedNotificationIds=[...(state.clearedNotificationIds||[]),...items.map(item=>item.id)];return items.length;}
  if(/^\/api\/notifications\/\d+\/actions$/.test(pathname)){const id=Number(pathname.split('/')[3]);return {notificationId:id,action:request.postDataJSON()?.action||'cta',route:['/pages/me/devices','/pages/store/orders','/pages/missions/missions','/pages/store/store',''][id-901],recorded:true};}
  return base(pathname+url.search);
}
