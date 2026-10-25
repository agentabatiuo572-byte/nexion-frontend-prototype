// Secondary presentation snapshots, served only by the loopback demo server.
const proof={source:'server',sourceEnvironment:'PRODUCTION',runId:'',serverCanonical:true};
const day=86400000;
export function secondaryDemo(url,state,request){
  const p=url.pathname,now=Date.now(),iso=new Date(now).toISOString(),empty=state.dataState==='empty';
  const page=Number(url.searchParams.get('page')||1),pageSize=Number(url.searchParams.get('pageSize')||20);
  const paginate=items=>({page,pageSize,totalRows:items.length,events:items.slice((page-1)*pageSize,page*pageSize)});
  if(p==='/api/app/profile/nickname-candidates')return {candidates:['Bright Fox 21','Calm Star 32','Swift Owl 43','Lunar Wolf 54','Amber Moon 65','Quiet Pine 76']};
  if(p==='/api/payout-addresses')return {...proof,addresses:[],serverNowEpochMs:now,changeCooldownDays:30,effectiveDelayHours:24,inFlightWithdrawalBlocked:true};
  if(p==='/api/me/notification-preferences'){
    state.notificationPreferences??={commission:true,team:true,staking:true,market:true,genesis:true,system:true};
    if(request.method()==='PATCH')Object.assign(state.notificationPreferences,request.postDataJSON(),{system:true});
    return state.notificationPreferences;
  }
  if(p==='/api/withdrawals/bank/config')return {enabled:true,banks:[],bankCodeRequired:false,bindingOtpRequired:!empty,bankSelection:'ACCOUNT_ROUTED',bankRoutingVerified:true,payType:'BANKQR',unresolvedIntent:null,beneficiary:empty?null:{bankCode:'',bankName:'ACCOUNT_ROUTED',maskedAccount:'••••4242',effectiveAt:iso,nextChangeAt:iso,beneficiaryNo:'DEMO-BANK-1',canWithdraw:true,bankRoutingVerified:true},policy:{version:1,minAmountUsd:10,maxAmountUsd:10000,feeRatePct:1,feeMinUsd:1,feeMaxUsd:100},capacity:{maxWithdrawableUsdt:empty?0:10000,dailyRemainingCount:3,dailyLimitCount:3,dailyCountResetAt:new Date(now+day).toISOString(),withdrawalEnabled:true}};
  if(p==='/api/payment-methods')return {serverCanonical:true,cards:empty?[]:[{tokenId:'9001',version:1,brand:'visa',last4:'4242',expiry:'12/30',holder:'ALEX DEMO',status:'BOUND',isDefault:true,boundAt:iso,source:'mock',sandbox:true,providerCanonical:false}]};
  if(p.startsWith('/api/goals')){
    state.goals??=[{id:1,targetUsdt:1000,deadlineAt:now+30*day,createdAt:now-10*day,achieved:false,achievedAt:null,progressPct:37.5,lifetimeEarningsUsdt:375},{id:2,targetUsdt:100,deadlineAt:now-day,createdAt:now-40*day,achieved:true,achievedAt:now-2*day,progressPct:100,lifetimeEarningsUsdt:375}];
    if(p==='/api/goals/recommendation'){const targetUsdt=Number(url.searchParams.get('targetUsdt')),days=Math.max(1,Math.ceil((Number(url.searchParams.get('deadlineAt'))-now)/day)),requiredDaily=Math.max(0,(targetUsdt-375)/days);return {...proof,source:'nx_product',purchaseRequired:requiredDaily>0,productNo:requiredDaily>0?'stellarbox-pro':null,productName:requiredDaily>0?'UVELBox Pro':null,dailyEarn:requiredDaily>0?22.4:null,price:requiredDaily>0?4999:null,requiredDaily,targetUsdt,days};}
    if(p==='/api/goals'&&request.method()==='GET')return {serverCanonical:true,source:'nx_earning_goal',lifetimeEarningsUsdt:empty?0:375,goals:empty?[]:state.goals};
    if(p==='/api/goals'){const input=request.postDataJSON(),goal={id:Math.max(0,...state.goals.map(g=>g.id))+1,targetUsdt:input.targetUsdt,deadlineAt:input.deadlineAt,createdAt:now,achieved:false,achievedAt:null,progressPct:Math.min(100,375/input.targetUsdt*100),lifetimeEarningsUsdt:375};state.goals.push(goal);return goal;}
    const id=Number(p.split('/')[3]),goal=state.goals.find(g=>g.id===id);
    if(request.method()==='DELETE'){state.goals=state.goals.filter(g=>g.id!==id);return null;}
    if(p.endsWith('/status')&&goal){goal.achieved=request.postDataJSON().achieved;goal.achievedAt=goal.achieved?now:null;return goal;}
  }
  if(p.startsWith('/api/tasks/receipts')){
    const items=empty?[]:['IG','LL','VG'].map((taskClass,i)=>({...proof,receiptNo:'DEMO-RECEIPT-'+(i+1),taskNo:'DEMO-TASK-'+(i+1),taskClass,model:['SDXL','Llama 3.1','Video generation'][i],client:'Demo Studio',rewardUsdt:[2.34,8.5,5.4][i],rewardNex:1,earningStatus:'SETTLED',completedAt:now-(i+1)*3600000,startedAt:now-(i+1)*3600000-600000,durationSec:600,deviceId:41,deviceInstanceNo:'REVIEW-S1',deviceName:'UVELBox S1',deviceType:'BOX',deviceGpu:'RTX 4090',vramTotalGb:24,taskId:'demo-'+taskClass.toLowerCase(),taskName:['图像生成','语言推理','视频生成'][i],proofHash:String(i+1).repeat(64)}));
    if(p==='/api/tasks/receipts')return {...proof,items,nextOffset:null,nextCursor:null,total:items.length};
    return items.find(r=>r.receiptNo===p.split('/').pop());
  }
  if(p==='/api/earnings/release-status')return {serverCanonical:true,buckets:{withdrawable:empty?0:state.walletBalance??52800.64,pending_review:empty?0:12.5,bonus_locked:empty?0:50},assets:{USDT:{withdrawable:empty?0:state.walletBalance??52800.64,pending_review:empty?0:12.5,bonus_locked:empty?0:50},NEX:{withdrawable:empty?0:1280,pending_review:empty?0:10,bonus_locked:0}},releaseMode:'attest_or_manual',attestedOnlineSeconds:3600,requiredAttestationSeconds:86400,clusterRestricted:false};
  if(p==='/api/config/market/nex')return {...proof,source:'G3 weekly_curve + nx_price_index sampled history',asset:'NEX',currency:'USDT',currentPrice:.128,costBasis:.1,historyMaxDays:30,sparkline:[.118,.12,.117,.122,.124,.126,.128],history:[.118,.12,.117,.122,.124,.126,.128].map((price,i)=>({price,sampledAt:new Date(now-(6-i)*4*3600000).toISOString(),sampledAtEpochMs:now-(6-i)*4*3600000}))};
  if(p==='/api/app/team/insights/commissions'){
    const kinds=['direct_purchase','direct_device_earning','unilevel','binary','peer','cultivation','leadership','genesis','promotion','other'];
    const events=empty?[]:['unlocked','cooling','withdrawn','frozen'].map((status,i)=>({id:'demo-commission-'+i,kind:kinds[i],sourceUserName:['Maya','Linh','Sam','Rin'][i],layer:i===0?1:2,orderId:'DEMO-ORDER-004',orderAmountUSD:1299,amountUSDT:25*(i+1),amountNEX:10,ts:now-i*day,unlockAt:status==='cooling'?now+day:now-day,status}));
    const byKind=Object.fromEntries(kinds.map(kind=>{const rows=events.filter(e=>e.kind===kind);return [kind,{usdt:rows.reduce((a,e)=>a+e.amountUSDT,0),nex:rows.reduce((a,e)=>a+e.amountNEX,0),count:rows.length}]}));
    return {...proof,...paginate(events),generatedAt:iso,snapshotAt:iso,aggregate:{totalUSDT:empty?0:250,totalNEX:empty?0:40,directUSDT:empty?0:75,extendedUSDT:empty?0:175,contributorCount:events.length,monthUSDT:empty?0:250,monthNEX:empty?0:40,todayUSDT:empty?0:25,unlockedUSDT:empty?0:25,unlockedNEX:empty?0:10,coolingUSDT:empty?0:50,eventCount:events.length,nextUnlockAt:empty?null:now+day,byKind}};
  }
  if(p==='/api/app/team/insights/leaderboard'){
    const rows=empty?[]:['Maya','Linh','Alex','Sam','Rin'].map((handle,i)=>({rank:i+1,handle,flag:['🇸🇬','🇻🇳','🇯🇵','🇸🇬','🇯🇵'][i],cc:['SG','VN','JP','SG','JP'][i],directs:20-i*3,teamSize:100-i*12,earnedUSDT:1000-i*130,delta:i-2,vRank:8-i,hasDevice:true}));
    return {...proof,period:url.searchParams.get('period')||'month',rows:rows.slice((page-1)*pageSize,page*pageSize),page,pageSize,totalRows:rows.length,myRank:empty?null:3,gapToNext:empty?0:130,poolUsd:empty?0:5000,topN:10,generatedAt:iso,snapshotAt:iso,snapshotVersion:'d'.repeat(64)};
  }
  if(p==='/api/app/team/insights/unilevel'){
    const all=empty?[]:[1,2,3].map((layer,i)=>({id:'demo-unilevel-'+i,source:'device_purchase',sourceUserName:['Maya','Linh','Sam'][i],cycle:'2026-10',layer,orderId:'DEMO-ORDER-004',orderAmountUSD:1299,amountUSDT:30-i*10,amountNEX:5,currency:'USDT',status:i===0?'unlocked':'cooling',ts:now-i*day,unlockAt:now+day}));
    const filter=url.searchParams.get('filter')||'all',events=all.filter(e=>filter==='all'||(filter==='direct'?e.layer===1:e.layer>1));
    const sum=rows=>({amountUSDT:rows.reduce((a,e)=>a+e.amountUSDT,0),amountNEX:rows.reduce((a,e)=>a+e.amountNEX,0),count:rows.length});
    return {...proof,period:url.searchParams.get('period')||'month',...paginate(events),split:{direct:sum(all.filter(e=>e.layer===1)),extended:sum(all.filter(e=>e.layer>1))},generatedAt:iso,snapshotAt:iso};
  }
  if(p==='/api/app/team/insights/leadership-pool'){
    const myRank=state.highestRank?8:2,distribution=empty?[]:[2,4,6,8].map(vRank=>({vRank,people:2,votes:vRank})),totalVotes=distribution.reduce((s,r)=>s+r.people*r.votes,0),myVotes=empty?0:myRank,mySharePct=totalVotes?myVotes/totalVotes:0;
    return {...proof,currentWeekPoolUSDT:empty?0:5000,myRank,myVotes,totalVotes,mySharePct,projectedPayoutUSDT:5000*mySharePct,distribution,history:empty?[]:[{weekId:'2026-W42',payoutUSDT:120}],nextPayoutAt:new Date(now+3*day).toISOString(),unlockRank:2,injectRate:.05,topN:100};
  }
  if(p==='/api/events/genesis-raffle') {
    const anchor=state.raffleScenarioAt??(state.raffleScenarioAt=now), mode=state.raffleState;
    const startsAt=mode==='upcoming'?anchor+60000:anchor-2*day;
    const drawAt=mode==='ending'?anchor+60000:mode==='ended'?anchor-1000:anchor+day;
    const prizes=mode==='small-usdt'
      ? ['0.00032','0.00005'].map((amount,i)=>({id:'demo-prize-'+i,nameZh:amount+' USDT 奖励',nameEn:amount+' USDT reward',nameVi:'Thưởng '+amount+' USDT',rewardType:'USDT',amount,quantity:10}))
      : [{id:'demo-prize',nameZh:'100 UVT 奖励',nameEn:'100 UVT reward',nameVi:'Thưởng 100 UVT',rewardType:'NEX',amount:'100',quantity:10}];
    return {availableTickets:empty?0:3-(state.raffleEntries||0),draws:empty||state.eventState==='empty'?[]:['OPEN','PROCESSING','DRAWN'].map((status,i)=>({id:'demo-draw-'+i,titleZh:['成长抽奖','上一期抽奖','已开奖记录'][i],titleEn:['Growth draw','Previous draw','Draw results'][i],titleVi:['Vòng quay tăng trưởng','Kỳ trước','Kết quả'][i],startsAt:new Date(i===0?startsAt:anchor-2*day).toISOString(),drawAt:new Date(i===0?drawAt:anchor-day).toISOString(),status,revision:1,myEntries:i===0?state.raffleEntries||0:2,totalEntries:120+(i===0?state.raffleEntries||0:0),prizes,myResults:i===2?prizes.map(prize=>({prizeId:prize.id,rewardType:prize.rewardType,amount:prize.amount,receiptId:'DEMO-RAFFLE-RECEIPT-'+prize.id,status:'PAID'})):[]}))};
  }
  if(p==='/api/events/genesis-raffle/demo-draw-0/enter'){
    const anchor=state.raffleScenarioAt??now;
    if((state.raffleState==='upcoming'&&now<anchor+60000)||(state.raffleState==='ending'&&now>=anchor+60000)||state.raffleState==='ended')throw new Error('Demo draw is not accepting entries');
    const tickets=request.postDataJSON().tickets;if(!Number.isInteger(tickets)||tickets<1||tickets>3-(state.raffleEntries||0))throw new Error('Invalid demo tickets');
    state.raffleEntries=(state.raffleEntries||0)+tickets;return {drawId:'demo-draw-0',enteredTickets:tickets,availableTickets:3-state.raffleEntries};
  }
}
