// Read-only samples for auxiliary screens. Never imported by production source.
const day=86400000;
const proof={source:'server',sourceEnvironment:'PRODUCTION',runId:''};
export function auxiliaryDemo(url,locale,state,request) {
  if(request.method()!=='GET')return undefined;
  const p=url.pathname,now=Date.now(),iso=new Date(now).toISOString(),empty=state.dataState==='empty';
  const lang=(url.searchParams.get('locale')||url.searchParams.get('language')||locale).split('-')[0];
  const text=(zh,en,vi)=>lang==='zh'?zh:lang==='vi'?vi:en;
  const sample=text('原型演示资料，正式内容以发布版本为准。','Prototype sample. Refer to the published version for formal content.','Tài liệu nguyên mẫu. Nội dung chính thức theo phiên bản công bố.');
  if(p==='/api/app/proof') {
    const streak=empty?0:state.saverUsed?(state.checkedIn?8:7):state.streakState==='broken'?(state.checkedIn?1:0):(state.checkedIn?3:2);
    return {...proof,serverCanonical:true,generatedAt:iso,serverTime:iso,asOf:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),provenance:{source:'server',environment:'PRODUCTION',runId:'',timeZone:'Asia/Ho_Chi_Minh',streakRule:'PROTOTYPE_SAMPLE',percentileRule:'PROTOTYPE_SAMPLE'},joinedAt:'2026-01-01T00:00:00Z',activeDays:empty?0:100,onlineDevices:empty?0:2,currentStreak:streak,longestStreak:empty?0:Math.max(state.streakState==='broken'||state.saverUsed?7:5,streak),topPercentile:empty?null:7,earningsTotalUsdt:empty?0:128.5,referralCode:'UVELDEMO',referral:{invitedCount:empty?0:12,lifetimeInviterNex:empty?0:100},team:{totalMembers:empty?0:8,activeMembers:empty?0:6},availability:{status:empty?'EMPTY':'READY'}};
  }
  if(p==='/api/config/commission/direct-referral')return {...proof,serverCanonical:true,configured:!empty,policyVersion:empty?0:3,effectiveAt:empty?null:'2026-10-01T00:00:00Z',nexUsdtPrice:empty?null:.128,purchase:{enabled:!empty,totalRatePct:empty?0:10,usdtSharePct:60,coolingDays:7},deviceEarning:{enabled:!empty,totalRatePct:empty?0:5,usdtSharePct:70,coolingDays:0}};
  if(p==='/api/app/team/insights/direct-referral') {
    const kind=url.searchParams.get('kind')==='device_earning'?'direct_device_earning':'direct_purchase';
    const events=empty?[]:[{id:'DEMO-DIRECT-1',kind,sourceUserName:'Maya',sourceRef:'DEMO-ORDER-004',sourceDeviceId:kind==='direct_device_earning'?'REVIEW-S1':null,policyVersion:3,basisUsdt:100,nexUsdtPrice:.128,amountUSDT:3.5,amountNEX:11.71875,ts:now-day,unlockAt:now-day,status:'unlocked',recoveryPendingUSDT:0,recoveryPendingNEX:0}];
    const totals={amountUSDT:empty?0:3.5,amountNEX:empty?0:11.71875,count:events.length},zero={amountUSDT:0,amountNEX:0,count:0};
    return {...proof,serverCanonical:true,period:url.searchParams.get('period')||'month',page:Number(url.searchParams.get('page')||1),pageSize:Number(url.searchParams.get('pageSize')||20),totalRows:events.length,events,split:{purchase:kind==='direct_purchase'?totals:zero,deviceEarning:kind==='direct_device_earning'?totals:zero},generatedAt:iso,snapshotAt:url.searchParams.get('snapshotAt')||iso};
  }
  if(p==='/api/tasks/assignments') {
    const task=(id,status,taskClass)=>({...proof,serverCanonical:true,taskNo:'DEMO-TASK-'+id,deviceId:41,taskId:'demo-'+taskClass.toLowerCase(),taskName:text('图像生成','Image generation','Tạo hình ảnh'),taskClass,model:'SDXL',client:'Demo Studio',status,rewardUsdt:2.34,requiredSeconds:600,startedAt:new Date(now-(status==='RUNNING'?300000:4200000)).toISOString(),completableAt:new Date(now+(status==='RUNNING'?300000:-3600000)).toISOString(),completedAt:status==='COMPLETED'?new Date(now-3600000).toISOString():null,receiptNo:status==='COMPLETED'?'DEMO-RECEIPT-1':null,proofNonce:null,proofExpiresAt:null});
    return {...proof,serverCanonical:true,serverNow:iso,devices:empty?[]:[{deviceId:41,instanceNo:'REVIEW-S1',deviceType:'GPU',lockUntil:null,currentTask:task(4,'RUNNING','IG'),recentTasks:[task(1,'COMPLETED','IG')]}]};
  }
  if(p==='/api/app/support/faqs/page') {
    const questions=[
      ['account','如何查看账户信息？','Where can I view account details?','Xem thông tin tài khoản ở đâu?','在“我的”中打开账户资料；修改后可返回核对。','Open your profile from Me, then return to verify any changes.','Mở hồ sơ từ Tôi và kiểm tra lại sau thay đổi.'],
      ['earning','预估收益和已结算有什么区别？','How do estimates differ from settled earnings?','Ước tính khác thu nhập đã quyết toán thế nào?','预估不是到账承诺。已结算金额以收益明细为准。','Estimates are not payment commitments. Settled amounts follow the earnings record.','Ước tính không phải cam kết trả tiền. Số đã quyết toán theo chi tiết thu nhập.'],
      ['device','在哪里查看设备作业？','Where can I view device jobs?','Xem tác vụ thiết bị ở đâu?','打开设备详情，查看当前作业和完成记录。','Open device details for current jobs and completed records.','Mở chi tiết thiết bị để xem tác vụ hiện tại và lịch sử.'],
      ['team','算力点是美元吗？','Are compute points dollars?','Điểm tính toán có phải USD?','不是。平台算力点用于统计算力；价格和奖励使用各自货币单位。','No. Platform compute points count compute; prices and rewards use their stated currency.','Không. Điểm nền tảng đếm năng lực; giá và thưởng dùng đơn vị tiền tương ứng.'],
    ];
    const category=url.searchParams.get('category'),pageNum=Number(url.searchParams.get('pageNum')||1),pageSize=Number(url.searchParams.get('pageSize')||20);
    const all=empty?[]:questions.filter(r=>!category||category==='all'||r[0]===category).map((r,i)=>({id:'demo-faq-'+i,category:r[0],question:text(r[1],r[2],r[3]),answer:text(r[4],r[5],r[6]),language:url.searchParams.get('language')||lang,sortOrder:i,version:1,updatedAt:iso}));
    return {records:all.slice((pageNum-1)*pageSize,pageNum*pageSize),total:all.length,pageNum,pageSize};
  }
  if(p==='/api/app/network/regions') {
    const regions=empty?[]:[['sg','Singapore',1.35,103.82,40,12],['jp','Tokyo',35.68,139.69,20,6],['vn','Ho Chi Minh City',10.82,106.63,10,3]].map(([id,name,latitude,longitude,activeNodes,activeJobs],i)=>({id,displayName:name,location:name,latitude,longitude,activeNodes,activeJobs,jobsPerHour:activeJobs*5,isUserRegion:i===0}));
    return {source:'server',generatedAt:iso,countryCount:regions.length,activeNodes:regions.reduce((n,r)=>n+r.activeNodes,0),activeJobs:regions.reduce((n,r)=>n+r.activeJobs,0),regions};
  }
  if(/^\/api\/content\/how-it-works\/wallet-(exchange|repurchase)-how$/.test(p)) {
    const exchange=p.includes('exchange'),title=exchange?text('兑换说明','Exchange guide','Hướng dẫn đổi'):text('复投说明','Re-investment guide','Hướng dẫn tái đầu tư');
    return {...proof,contentKey:p.split('/').pop(),version:'prototype-v1',versionSource:'ENTRY',locale:lang,status:'PUBLISHED',blocks:[
      {id:'intro',kind:'text',title,body:sample},
      {id:'steps',kind:'list',title:text('操作步骤','Steps','Các bước'),body:text('提交前核对金额与当前规则。','Review the amount and current rules before submitting.','Kiểm tra số tiền và quy tắc hiện tại trước khi gửi.'),items:[text('输入金额并查看当前报价或方案。','Enter an amount and review the quote or plan.','Nhập số tiền và xem báo giá hoặc kế hoạch.'),text('查看费用、限制和适用条款。','Review fees, limits and applicable terms.','Xem phí, hạn mức và điều khoản.'),text('确认结果后在记录中查看状态。','Check the result in your records.','Kiểm tra kết quả trong lịch sử.')]},
      {id:'consequences',kind:'callout',title:text('需要了解','Before you continue','Trước khi tiếp tục'),body:exchange?text('报价可能变化；以确认时的报价和订单结果为准。演示不会兑换真实资产。','Quotes can change; use the confirmed quote and order result. The demo does not exchange real assets.','Báo giá có thể đổi; theo báo giá xác nhận và kết quả đơn. Bản mẫu không đổi tài sản thật.'):text('复投可能有锁定期限；提前退出的费用和可领取金额以订单条款为准。演示不会锁定真实资金。','Re-investment may have a lock period. Early-exit fees and claimable amounts follow the order terms. The demo does not lock real funds.','Tái đầu tư có thể có thời hạn khóa. Phí thoát sớm và số được nhận theo điều khoản đơn. Bản mẫu không khóa tiền thật.')},
    ]};
  }
  if(p==='/api/content/how-it-works/genesis-how')return {...proof,contentKey:'genesis-how',version:'prototype-v1',versionSource:'ENTRY',locale:lang,status:'PUBLISHED',blocks:[
    {id:'intro',kind:'text',title:text('创世节点','Genesis nodes','Nút sáng thế'),body:text('即将上线。这里演示节点信息、我的持有记录与市场的查看流程。','Coming soon. Preview node information, your holdings and the marketplace.','Sắp ra mắt. Xem trước thông tin nút, tài sản nắm giữ và thị trường.')},
    {id:'steps',kind:'list',title:text('上线后可查看','What to explore','Nội dung có thể xem'),body:sample,items:[text('在节点首页查看开放状态。','Check availability on the Genesis page.','Kiểm tra trạng thái ở trang Nút sáng thế.'),text('在“我的”查看持有记录。','View your holdings in My nodes.','Xem bản ghi trong Nút của tôi.'),text('在市场查看挂单及交易记录。','Browse listings and transaction records in the marketplace.','Xem niêm yết và lịch sử giao dịch tại thị trường.')]},
    {id:'launch',kind:'callout',title:text('开放信息待公布','Launch details pending','Chờ thông tin mở bán'),body:text('正式开放时间、参与条件、价格和权益以发布资料为准。当前演示不接受申购或交易。','Published materials will specify launch timing, eligibility, pricing and benefits. This demo accepts no subscriptions or trades.','Tài liệu công bố sẽ nêu thời gian, điều kiện, giá và quyền lợi. Bản mẫu không nhận đăng ký mua hay giao dịch.')},
  ]};
  if(/^\/api\/public\/referrals\/[^/]+\/preview$/.test(p))return {code:decodeURIComponent(p.split('/')[4]),sourceEnvironment:'PRODUCTION',sponsor:{displayName:'A•••',vRank:'V3'},gift:{status:'DISABLED',usdtAmount:0,nexAmount:0}};
  if(p==='/api/developer/docs')return {...proof,status:'PUBLISHED',version:'prototype-v1',locale:lang,example:{request:'GET /v1/jobs/demo-job',response:'{"id":"demo-job","status":"COMPLETED"}'},endpoints:[{method:'GET',path:'/v1/jobs/{id}',description:sample}],events:['compute.job.completed','compute.job.failed']};
  if(p==='/api/app/developer/access-requests/latest')return empty?null:{...proof,requestNo:'DEMO-ACCESS-1',idempotencyKey:'demo-access-1',status:'APPROVED',submittedAt:iso};
  if(p==='/api/app/developer/api-keys')return empty?[]:[{...proof,id:1,keyId:'DEMO-KEY-1',name:text('演示应用','Demo app','Ứng dụng mẫu'),prefix:'demo_',last4:'0000',status:'ACTIVE',createdAt:iso}];
  if(p==='/api/app/developer/webhooks')return empty?[]:[{...proof,id:1,name:text('演示通知','Demo notification','Thông báo mẫu'),url:'https://example.invalid/demo-webhook',events:['compute.job.completed'],status:'DISABLED',deliveryStatus:'NOT_DELIVERED',deliveryEnabled:false,createdAt:iso}];
  if(/^\/api\/app\/developer\/webhooks\/\d+\/deliveries$/.test(p))return {items:[],hasMore:false,nextCursor:null};
  const ambassador='/api/app/team/ambassador-applications';
  if(p===ambassador+'/policy')return {...proof,policyVersion:'prototype-v1',revision:1,defaultBudgetUsdt:1000,buckets:['venue','kol','print','dev'].map((id,i)=>({id,title:[text('活动场地','Event venue','Địa điểm'),text('社区推广','Community outreach','Cộng đồng'),text('宣传物料','Printed materials','Tài liệu in'),text('开发支持','Developer support','Hỗ trợ phát triển')][i],range:'100–10,000 USDT',rule:sample,minBudgetUsdt:100,maxBudgetUsdt:10000}))};
  if(p===ambassador+'/latest')return {...proof,applicationId:null,status:'NONE'};
  if(p===ambassador)return {...proof,rows:[],pageNum:Number(url.searchParams.get('pageNum')||1),pageSize:Number(url.searchParams.get('pageSize')||50),total:0,hasMore:false};
  if(p==='/api/legal/terms/current')return {...proof,requestedLocale:url.searchParams.get('locale')||lang,resolvedLocale:lang,requestedJurisdiction:url.searchParams.get('jurisdiction')||'GLOBAL',resolvedJurisdiction:'GLOBAL',provenance:'prototype-sample',version:'v1',effectiveAt:iso,title:text('服务条款 · 演示','Terms of service · sample','Điều khoản · mẫu'),summary:sample,sections:[{key:'sample',title:text('原型使用范围','Prototype scope','Phạm vi nguyên mẫu'),body:text('这里展示条款的排版与阅读流程。演示操作不会产生真实订单、支付或合同。','This page demonstrates terms layout and reading. Demo actions do not create real orders, payments or agreements.','Trang này minh họa cách đọc điều khoản. Thao tác mẫu không tạo đơn hàng, thanh toán hay hợp đồng thật.'),sortOrder:0}],acknowledged:true,acknowledgedAt:iso};
  if(p==='/api/legal/risk-disclosure/current'||p==='/api/legal/risk-disclosure/public/current') {
    const publicRead=p.includes('/public/');
    const chapters=[['演示说明','Demo scope','Phạm vi mẫu'],['预估与结算','Estimates and settlement','Ước tính và quyết toán'],['设备运行','Device operation','Hoạt động thiết bị'],['市场变化','Market changes','Biến động thị trường'],['费用说明','Fees','Phí'],['退出规则','Exit conditions','Điều kiện thoát'],['联系支持','Contact support','Liên hệ hỗ trợ']];
    return {source:'server',sourceEnvironment:'PRODUCTION',jurisdiction:'GLOBAL',jurisdictionName:'Global',version:'v1',languageScope:'zh+vi+en',effectiveDate:iso.slice(0,10),acknowledged:!publicRead,acknowledgedAt:publicRead?null:iso,acknowledgmentToken:null,acknowledgmentTokenExpiresAt:null,minimumReadingSeconds:30,chapters:chapters.map(([zh,en,vi],i)=>({no:String(i+1).padStart(2,'0'),zh,en,vi,zhBody:'原型演示资料，非正式披露。实际条件、费用及风险须阅读正式发布资料。',enBody:'Prototype sample, not a formal disclosure. Read the published material for actual conditions, fees and risks.',viBody:'Tài liệu nguyên mẫu, không phải công bố chính thức. Đọc bản công bố để biết điều kiện, phí và rủi ro thực tế.'}))};
  }
  if(p==='/api/legal/privacy-policy/current')return {...proof,status:'PUBLISHED',version:'v1',locale:lang,hero:text('隐私政策 · 演示','Privacy policy · sample','Chính sách riêng tư · mẫu'),sections:[{id:'sample',title:text('资料范围','Data scope','Phạm vi dữ liệu'),body:sample,order:0},{id:'contact',title:text('联系与查询','Contact and requests','Liên hệ và yêu cầu'),body:text('需要查看账户资料或提出问题，可从帮助中心联系支持。此处仅演示阅读体验。','Use Help Center for profile questions or support. This page demonstrates the reading experience only.','Dùng Trung tâm trợ giúp cho câu hỏi hồ sơ. Trang này chỉ minh họa trải nghiệm đọc.'),order:1}]};
}
