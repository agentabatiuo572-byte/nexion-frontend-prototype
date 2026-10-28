// Loopback prototype publications only. Never imported by application source.
// Contract shapes follow direct-referral-runtime.mjs; shared facts are read from
// the active prototype fixture instead of duplicating its rates or rank ladder.
const KEYS = ['team-unilevel-how', 'team-binary-how', 'team-commissions-how'];
const PROOF = { source: 'server', sourceEnvironment: 'PRODUCTION', runId: '' };
// Existing direct-referral-runtime.mjs illustration; explicitly labelled below.
const DEMO_POOL_MONTHLY_CAP_USDT = 1000;

export function teamGuidesDemo(url, locale, request, read) {
  if (request.method() !== 'GET') return undefined;
  const key = url.pathname.startsWith('/api/content/how-it-works/') ? url.pathname.slice('/api/content/how-it-works/'.length) : '';
  const isGuide = url.pathname === '/api/config/commission/guide';
  if (!isGuide && !KEYS.includes(key)) return undefined;
  const requested = (url.searchParams.get('locale') || locale || 'en').toLowerCase().split(/[-_]/)[0];
  const language = ['zh', 'en', 'vi'].includes(requested) ? requested : 'en';
  const text = (zh, en, vi) => language === 'zh' ? zh : language === 'vi' ? vi : en;
  const unknown = text('未提供', 'Not provided', 'Chưa cung cấp');
  const number = value => typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat(language, { maximumFractionDigits: 6 }).format(value) : unknown;
  const direct = read('/api/config/commission/direct-referral?schemaVersion=2');
  const rankConfig = read('/api/config/v-ranks');
  const binary = read('/api/team/binary');
  const pool = read('/api/app/team/insights/leadership-pool');
  const ranks = rankConfig.ranks.filter(rank => rank.visible).sort((a, b) => a.v - b.v);
  const guide = {
    ...PROOF, serverCanonical: true, runId: null,
    // No uniform cooling period or independent depth/cap policy is supplied.
    coolingDays: null,
    network: { depthGateLayer: null, depthGateRank: null, exitCapRate: null },
    binary: {
      threshold: binary.threshold, matchRate: binary.matchRate, dailyCap: binary.dailyCap,
      settlePeriod: binary.settlePeriod, residualPolicy: binary.residualPolicy, paused: binary.paused,
    },
    leadership: { rate: pool.injectRate, minRank: pool.unlockRank, monthlyCap: DEMO_POOL_MONTHLY_CAP_USDT },
    capabilities: { ...rankConfig.capabilities },
  };
  if (isGuide) return guide;

  const sample = text(
    '本页为本地原型演示资料，金额与条件仅用于演示，不代表正式奖励规则或个人到账。',
    'Local prototype demo. Amounts and conditions illustrate the interface, not formal reward rules or personal payments.',
    'Đây là tài liệu minh họa nguyên mẫu cục bộ. Số tiền và điều kiện chỉ để minh họa, không phải quy tắc thưởng chính thức hay khoản đã nhận.'
  );
  const volumeBoundary = text(
    '两组业绩按已确认订单金额统计，退款会扣回。预估奖励与已结算金额分别查看，不能用业绩乘比例推算到账。',
    'Group volume counts confirmed order amounts, with refunds deducted. Review estimated and settled rewards separately; multiplying volume by a rate does not determine payment.',
    'Doanh số nhóm tính theo số tiền đơn đã xác nhận, trừ phần hoàn tiền. Xem riêng thưởng ước tính và đã quyết toán; nhân doanh số với tỷ lệ không xác định tiền nhận.'
  );
  const invitationScope = text(
    '从你出发，每经过一次邀请关系记为 1 步：1 步是你直接邀请的成员，2 步是他们直接邀请的成员，之后依次延伸。购买奖励按这些关系区分来源，直接与间接成员不能合并为同一种来源。是否计奖仍受当前等级允许的邀请范围、订单资格和结算状态约束。',
    'Count invitation steps from you: 1 step means a member you invited directly; 2 steps means a member they invited directly; each further invitation adds a step. Purchase rewards distinguish these relationships; direct and indirect members are separate sources. Eligibility still depends on the invitation scope allowed by your current rank, order eligibility and settlement status.',
    'Tính số bước mời từ bạn: 1 bước là thành viên bạn trực tiếp mời; 2 bước là người do họ trực tiếp mời; mỗi lời mời tiếp theo thêm một bước. Thưởng mua hàng phân biệt các quan hệ này; nguồn trực tiếp và gián tiếp được ghi riêng. Việc nhận thưởng vẫn phụ thuộc phạm vi mời được hạng hiện tại cho phép, điều kiện đơn hàng và trạng thái quyết toán.'
  );
  const poolExample = text(
    `团队激励池参与起点为演示配置 V${pool.unlockRank}；本页月上限 ${number(DEMO_POOL_MONTHLY_CAP_USDT)} USDT 是固定演示值。票数、份额与预估金额不等于已到账。`,
    `The demo team incentive pool starts at V${pool.unlockRank}. The ${number(DEMO_POOL_MONTHLY_CAP_USDT)} USDT monthly cap on this page is a fixed demo value. Votes, shares and estimated amounts are not payments.`,
    `Quỹ khuyến khích đội nhóm minh họa bắt đầu ở V${pool.unlockRank}. Giới hạn tháng ${number(DEMO_POOL_MONTHLY_CAP_USDT)} USDT trên trang là giá trị minh họa cố định. Phiếu, tỷ trọng và số tiền ước tính không phải khoản đã nhận.`
  );
  const block = (id, titles, bodies, items) => ({
    id, kind: items ? 'list' : 'text', title: text(...titles), body: text(...bodies), ...(items ? { items } : {}),
  });
  const sameBody = value => [value, value, value];
  const rule = value => !direct.configured || !value.enabled
    ? text('本演示状态未开放此来源的新奖励；已有记录可继续核对。', 'New rewards from this source are unavailable in this demo state; existing records can still be checked.', 'Trạng thái minh họa này chưa mở thưởng mới từ nguồn này; vẫn có thể kiểm tra bản ghi cũ.')
    : text(
      `演示比例 ${number(value.totalRatePct)}%；奖励分配为 USDT ${number(value.usdtSharePct)}% / UVT ${number(100 - value.usdtSharePct)}%，冷却期 ${number(value.coolingDays)} 天。`,
      `Demo rate ${number(value.totalRatePct)}%; reward split USDT ${number(value.usdtSharePct)}% / UVT ${number(100 - value.usdtSharePct)}%, with a ${number(value.coolingDays)}-day cooling period.`,
      `Tỷ lệ minh họa ${number(value.totalRatePct)}%; phân chia thưởng USDT ${number(value.usdtSharePct)}% / UVT ${number(100 - value.usdtSharePct)}%, thời gian chờ ${number(value.coolingDays)} ngày.`
    );
  const rankItems = ranks.map(rank => text(
    `V${rank.v}：购买奖励适用范围为从你出发最多 ${number(rank.unilevelDepth)} 步邀请关系；自购算力 ${number(rank.selfComputePoints)} 点、团队算力 ${number(rank.teamComputePoints)} 点、直接邀请成员 ${number(rank.directRefs)} 人。`,
    `V${rank.v}: purchase rewards apply to invitation relationships up to ${number(rank.unilevelDepth)} steps from you; own compute ${number(rank.selfComputePoints)} points, team compute ${number(rank.teamComputePoints)} points, ${number(rank.directRefs)} directly invited members.`,
    `V${rank.v}: phạm vi thưởng mua hàng tối đa ${number(rank.unilevelDepth)} bước mời tính từ bạn; năng lực tự mua ${number(rank.selfComputePoints)} điểm, đội nhóm ${number(rank.teamComputePoints)} điểm, ${number(rank.directRefs)} thành viên được mời trực tiếp.`
  ));
  let blocks;
  if (key === 'team-unilevel-how') {
    blocks = [
      block('hero', ['团队奖励说明 · 演示', 'Team rewards guide · Demo', 'Hướng dẫn thưởng đội nhóm · Minh họa'], sameBody(sample)),
      block('seven-layer-scope', ['邀请关系与购买奖励', 'Invitation relationships and purchase rewards', 'Quan hệ mời và thưởng mua hàng'], sameBody(invitationScope)),
      block('direct-referral-scope', ['直接邀请的设备收益奖励', 'Device earnings from direct invitations', 'Thưởng thu nhập thiết bị từ lời mời trực tiếp'], [
        '设备收益奖励只给直接邀请人，由平台额外支付，成员原设备收益不扣减。这与按邀请关系区分来源的购买奖励分开核算。',
        'Device earnings rewards go only to the direct inviter. The platform pays extra; the member keeps the original device earnings. This is accounted for separately from purchase rewards attributed to different invitation relationships.',
        'Thưởng thu nhập thiết bị chỉ trả cho người mời trực tiếp. Nền tảng trả thêm, thành viên giữ nguyên thu nhập thiết bị. Khoản này được tính riêng với thưởng mua hàng từ các quan hệ mời khác nhau.'
      ]),
      block('purchase-rule', ['直接购买奖励比例', 'Direct purchase reward rate', 'Tỷ lệ thưởng mua trực tiếp'], sameBody(rule(direct.purchase))),
      block('device-rule', ['设备收益奖励比例', 'Device earnings reward rate', 'Tỷ lệ thưởng thu nhập thiết bị'], sameBody(rule(direct.deviceEarning))),
      block('rank-depths', ['演示等级条件与适用范围', 'Demo rank requirements and reward scope', 'Điều kiện hạng và phạm vi thưởng minh họa'], [
        '以下数值来自当前演示等级表。算力点与购买金额分开计量；达到点数后仍须满足该等级其他条件并完成资格核验。',
        'These values follow the current demo ladder. Compute points and purchase amounts are separate measures. Reaching a point target still requires the other rank conditions and eligibility verification.',
        'Các giá trị theo bảng hạng minh họa hiện tại. Điểm tính toán và tiền mua hàng là hai đại lượng riêng. Đạt điểm vẫn cần đáp ứng điều kiện hạng khác và được xác minh.'
      ], rankItems),
      block('unknown-network-rates', ['间接邀请的规则信息', 'Rules for indirect invitations', 'Thông tin thưởng từ lời mời gián tiếp'], [
        '购买记录分别保留你直接邀请的成员、这些成员邀请的人及后续邀请关系的来源。未提供各类间接邀请关系的完整比例、额外门槛和总封顶规则，不能沿用直接邀请比例或把允许的邀请范围视为到账保证。各笔金额按对应订单和奖励记录核对。',
        'Purchase records distinguish members you invited directly, members they invited, and further invitation relationships. Full rates for each indirect relationship, additional eligibility requirements and an overall cap are not supplied. Do not reuse the direct invitation rate or treat the allowed invitation scope as a payment guarantee. Check each order and reward record.',
        'Bản ghi mua hàng phân biệt thành viên bạn mời trực tiếp, người do họ mời và các quan hệ mời tiếp theo. Chưa cung cấp đầy đủ tỷ lệ cho từng quan hệ gián tiếp, điều kiện bổ sung và giới hạn tổng. Không dùng lại tỷ lệ mời trực tiếp hay coi phạm vi mời được phép là bảo đảm nhận tiền. Kiểm tra từng đơn và bản ghi thưởng.'
      ]),
      block('settlement', ['金额、币种与退款', 'Amounts, currencies and refunds', 'Số tiền, loại tiền và hoàn tiền'], [
        'USDT 与 UVT 分别核对，不直接相加或暗中兑换。已结算、冷却、冻结、冲正及待追回是不同状态；退款后某一币种被冲正时，不代表另一币种也必然失效。',
        'Check USDT and UVT separately; do not add them together or silently convert them. Settled, cooling, frozen, reversed and recovery-pending are distinct states. Reversal in one currency does not automatically invalidate the other.',
        'Kiểm tra USDT và UVT riêng, không cộng chung hoặc tự quy đổi. Đã quyết toán, chờ, đóng băng, đảo giao dịch và chờ thu hồi là các trạng thái khác nhau. Đảo giao dịch một loại tiền không tự làm loại còn lại mất hiệu lực.'
      ]),
    ];
  } else if (key === 'team-binary-how') {
    const period = { daily: text('每日', 'daily', 'hằng ngày'), weekly: text('每周', 'weekly', 'hằng tuần'), monthly: text('每月', 'monthly', 'hằng tháng') }[binary.settlePeriod];
    const residual = { monthlyClear: text('每月清零', 'monthly reset', 'xóa theo tháng'), perPairClear: text('每次匹配结算后清零', 'reset after each match settlement', 'xóa sau mỗi lần quyết toán ghép'), carryForward: text('转入下一期', 'carry forward', 'chuyển sang kỳ sau') }[binary.residualPolicy];
    blocks = [
      block('hero', ['双区贡献奖励说明 · 演示', 'Two-group contribution rewards · Demo', 'Thưởng đóng góp hai nhóm · Minh họa'], sameBody(sample)),
      block('groups', ['A 组与 B 组', 'Group A and Group B', 'Nhóm A và nhóm B'], [
        '成员按安置规则进入 A 或 B 组；分组不改变直接与间接邀请关系，也不代表新增奖励资格。',
        'Placement rules assign members to Group A or B. Placement does not change direct or indirect invitation relationships or grant reward eligibility.',
        'Quy tắc xếp thành viên vào nhóm A hoặc B. Việc xếp nhóm không đổi quan hệ mời trực tiếp, gián tiếp hay tự cấp điều kiện nhận thưởng.'
      ]),
      block('point-comparison', ['两组业绩对比', 'Compare group volume', 'So sánh doanh số hai nhóm'], sameBody(volumeBoundary), [
        text(`A 组业绩 ${number(binary.trackA)} USDT；B 组业绩 ${number(binary.trackB)} USDT。`, `Group A volume: ${number(binary.trackA)} USDT; Group B volume: ${number(binary.trackB)} USDT.`, `Doanh số nhóm A: ${number(binary.trackA)} USDT; nhóm B: ${number(binary.trackB)} USDT.`),
        text(`本演示公布的每组业绩门槛：${number(binary.threshold)} USDT。资格还需核对完整结算条件。`, `Published demo threshold per group: ${number(binary.threshold)} USDT. Full settlement conditions still apply.`, `Ngưỡng doanh số mỗi nhóm minh họa: ${number(binary.threshold)} USDT. Vẫn áp dụng đầy đủ điều kiện quyết toán.`),
      ]),
      block('amount-and-rate', ['预估金额与规则', 'Estimated amount and rules', 'Số tiền ước tính và quy tắc'], [
        `本期演示预估为 ${number(binary.estimatedAmountUsdt)} USDT，直接读取奖励预估值，不在本页重算。演示比例 ${number(binary.matchRate * 100)}%；${period}结算；日上限 ${number(binary.dailyCap)} USDT；本期上限 ${number(binary.periodCap)} USDT。`,
        `The demo period estimate is ${number(binary.estimatedAmountUsdt)} USDT, read directly from the reward estimate, not recalculated here. Demo rate ${number(binary.matchRate * 100)}%; settlement ${period}; daily cap ${number(binary.dailyCap)} USDT; period cap ${number(binary.periodCap)} USDT.`,
        `Ước tính kỳ minh họa là ${number(binary.estimatedAmountUsdt)} USDT, lấy trực tiếp từ giá trị thưởng ước tính, không tính lại trên trang. Tỷ lệ minh họa ${number(binary.matchRate * 100)}%; quyết toán ${period}; giới hạn ngày ${number(binary.dailyCap)} USDT; giới hạn kỳ ${number(binary.periodCap)} USDT.`
      ]),
      block('qualification', ['结算前核对资格', 'Check eligibility before settlement', 'Kiểm tra điều kiện trước quyết toán'], [
        '两组均须满足公布的条件；暂停、分组不完整、退款冲回或结算日未到都可能影响结算。当前开关未暂停也不等于奖励已到账。',
        'Both groups must meet the published conditions. Pauses, incomplete placement, refund reversals or an upcoming settlement date can affect settlement. An unpaused setting does not mean payment has arrived.',
        'Cả hai nhóm cần đáp ứng điều kiện công bố. Tạm dừng, xếp nhóm chưa đủ, thu hồi do hoàn tiền hoặc chưa đến ngày có thể ảnh hưởng quyết toán. Chưa tạm dừng không có nghĩa đã nhận tiền.'
      ]),
      block('residual', ['未结算贡献的处理', 'Handling remaining contributions', 'Xử lý đóng góp còn lại'], [
        `当前演示处理方式：${residual}。它描述结算后剩余贡献的处理，不是现金余额或已得收益。`,
        `Current demo handling: ${residual}. This describes remaining contributions after settlement, not a cash balance or earned income.`,
        `Cách xử lý minh họa hiện tại: ${residual}. Đây là cách xử lý đóng góp còn lại sau quyết toán, không phải số dư tiền hay thu nhập đã nhận.`
      ]),
      block('records', ['预估与到账分开查看', 'Separate estimates from payments', 'Xem riêng ước tính và tiền đã nhận'], [
        '预估只是当前展示值。已结算金额查看奖励记录；合法的零金额与未知值不同。失败时重新加载，不把读取失败写成零收益。',
        'An estimate is a current projection. Check reward records for settled amounts. A valid zero differs from an unknown value; reload after a failure rather than treating it as zero earnings.',
        'Ước tính là dự phóng hiện tại. Xem số đã quyết toán trong bản ghi thưởng. Giá trị 0 hợp lệ khác với giá trị chưa biết; tải lại khi lỗi, không coi lỗi đọc là thu nhập bằng không.'
      ]),
    ];
  } else {
    blocks = [
      block('hero', ['奖励记录说明 · 演示', 'Reward records guide · Demo', 'Hướng dẫn bản ghi thưởng · Minh họa'], sameBody(sample)),
      block('overview', ['先区分来源与状态', 'Identify sources and status', 'Phân biệt nguồn và trạng thái'], sameBody(`${invitationScope} ${poolExample}`)),
      block('channels', ['不同奖励分别核对', 'Check each reward source separately', 'Kiểm tra riêng từng nguồn thưởng'], sameBody(volumeBoundary)),
      block('network', ['团队奖励：购买与设备收益', 'Team rewards: purchases and device earnings', 'Thưởng đội nhóm: mua hàng và thu nhập thiết bị'], [
        '购买记录分别保留直接邀请、成员继续邀请等不同关系的来源。直接购买：{directPurchaseRules}。间接购买：{networkPurchaseRules}。直接成员设备收益：{directDeviceRules}。{directScope}。演示 UVT 报价：{directPrice}。',
        'Purchase records retain the distinct sources from direct invitations and further invitations by members. Direct purchases: {directPurchaseRules}. Indirect purchases: {networkPurchaseRules}. Direct member device earnings: {directDeviceRules}. {directScope}. Demo UVT quote: {directPrice}.',
        'Bản ghi mua hàng ghi riêng nguồn từ lời mời trực tiếp và từ những người được thành viên tiếp tục mời. Mua trực tiếp: {directPurchaseRules}. Mua gián tiếp: {networkPurchaseRules}. Thu nhập thiết bị thành viên trực tiếp: {directDeviceRules}. {directScope}. Báo giá UVT minh họa: {directPrice}.'
      ]),
      block('binary', ['双区贡献奖励', 'Two-group contribution rewards', 'Thưởng đóng góp hai nhóm'], sameBody('{binaryRules}')),
      block('peer', ['同级奖励', 'Peer rewards', 'Thưởng đồng cấp'], sameBody('{peerRules} {peerStatus}')),
      block('cultivation', ['成员成长奖励', 'Member growth reward', 'Thưởng phát triển thành viên'], sameBody('{cultivationRules}')),
      block('leadership', ['团队激励池', 'Team incentive pool', 'Quỹ khuyến khích đội nhóm'], sameBody('{leadershipRules}')),
      block('genesis', ['Genesis 独立奖励', 'Independent Genesis rewards', 'Thưởng Genesis độc lập'], sameBody('{genesisStatus}')),
      block('lifecycle', ['记录状态如何理解', 'Understanding record status', 'Hiểu trạng thái bản ghi'], [
        '规则中的奖励金额不代表已经支付。请分别核对待计算、冷却、可用、已提现及退款处理状态。',
        'A configured reward amount is not a payment. Check calculation pending, cooling, available, withdrawn and refund-related states separately.',
        'Mức thưởng theo quy tắc không phải khoản đã trả. Kiểm tra riêng trạng thái chờ tính, chờ, khả dụng, đã rút và xử lý hoàn tiền.'
      ]),
      block('cooling', ['冷却或待确认', 'Cooling or pending confirmation', 'Đang chờ hoặc chờ xác nhận'], [
        '按对应来源的等待期和释放条件处理。购买与设备收益可以有不同等待期，不套用统一天数。',
        'The source-specific waiting period and release conditions apply. Purchases and device earnings can have different waiting periods; there is no assumed universal duration.',
        'Áp dụng thời gian chờ và điều kiện mở khóa theo từng nguồn. Mua hàng và thu nhập thiết bị có thể có thời gian khác nhau, không mặc định cùng số ngày.'
      ]),
      block('unlocked', ['已解锁', 'Unlocked', 'Đã mở khóa'], [
        '已解锁金额与可提现余额按当前记录核对；这不等于银行卡或外部钱包已经到账。',
        'Check unlocked amounts and withdrawable balance in current records; this does not mean a bank or external wallet has received funds.',
        'Kiểm tra số đã mở khóa và số dư có thể rút theo bản ghi hiện tại; không có nghĩa ngân hàng hoặc ví ngoài đã nhận tiền.'
      ]),
      block('withdrawn', ['已提现', 'Withdrawn', 'Đã rút'], [
        '该奖励记录已进入提现结果；具体收款状态还需查看对应提现单。',
        'This reward record is associated with a withdrawal result; check the linked withdrawal order for receipt status.',
        'Bản ghi thưởng gắn với kết quả rút tiền; xem lệnh rút tương ứng để biết trạng thái nhận.'
      ]),
      block('cooling-note', ['退款和冲正仍需核对', 'Check refunds and reversals', 'Kiểm tra hoàn tiền và đảo giao dịch'], [
        '退款、争议或追回可能改变奖励状态。USDT 和 UVT 分别核对，不能把一币种的冲正自动套用到另一币种。',
        'Refunds, disputes or recovery may change reward status. Check USDT and UVT separately; a reversal in one currency does not automatically apply to the other.',
        'Hoàn tiền, tranh chấp hoặc thu hồi có thể đổi trạng thái thưởng. Kiểm tra USDT và UVT riêng; đảo giao dịch một loại tiền không tự áp dụng cho loại kia.'
      ]),
      block('example', ['固定演示算例', 'Fixed demo illustration', 'Ví dụ minh họa cố định'], [
        '以下假设订单基数仅用于说明。成员成长奖励使用当前演示等级表的首个非零奖励标准，不是当前账号到账金额。',
        'The hypothetical order base below is illustrative. The member growth example uses the first nonzero reward in the current demo ladder, not a payment to this account.',
        'Giá trị đơn giả định dưới đây chỉ để minh họa. Ví dụ phát triển thành viên dùng mức thưởng khác không đầu tiên trong bảng hạng minh họa, không phải tiền tài khoản đã nhận.'
      ]),
      block('example-day', ['假设订单', 'Hypothetical order', 'Đơn giả định'], sameBody('{exampleBase}')),
      block('example-network', ['团队奖励算例', 'Team reward example', 'Ví dụ thưởng đội nhóm'], sameBody('{exampleBase}')),
      block('example-cultivation', ['成员成长奖励算例', 'Member growth example', 'Ví dụ phát triển thành viên'], sameBody('{exampleRank}')),
      block('example-peer', ['同级奖励状态', 'Peer reward status', 'Trạng thái thưởng đồng cấp'], sameBody('{peerStatus}')),
      block('example-leadership', ['团队激励池预估', 'Team incentive pool estimate', 'Ước tính quỹ khuyến khích đội nhóm'], sameBody('{leadershipRules}')),
      block('example-total', ['不合并为收益承诺', 'Not a promised earnings total', 'Không phải tổng thu nhập cam kết'], [
        '不同币种与不同状态不能直接相加。', 'Do not add different currencies and states together.', 'Không cộng chung các loại tiền và trạng thái khác nhau.'
      ]),
      block('example-note', ['演示边界', 'Demo scope', 'Phạm vi minh họa'], sameBody(sample)),
      block('faq', ['常见问题', 'Common questions', 'Câu hỏi thường gặp'], [
        '先查看对应订单、来源邀请关系和币种状态。', 'Start with the linked order, invitation relationship and currency status.', 'Trước tiên xem đơn tương ứng, quan hệ mời và trạng thái loại tiền.'
      ]),
      block('faq-order', ['为什么没有预期奖励？', 'Why is an expected reward missing?', 'Vì sao chưa thấy thưởng dự kiến?'], [
        '核对订单资格、直接或间接邀请关系、当前等级允许的邀请范围和奖励状态。成员数增加不自动产生已结算奖励，未提供的各类邀请关系比例不能自行补算。',
        'Check order eligibility, direct or indirect relationships, the invitation scope allowed by your current rank and reward status. More members do not automatically produce settled rewards; missing rates for each invitation relationship must not be guessed.',
        'Kiểm tra điều kiện đơn, quan hệ trực tiếp hoặc gián tiếp, phạm vi mời được hạng hiện tại cho phép và trạng thái thưởng. Thêm thành viên không tự tạo thưởng đã quyết toán; không đoán tỷ lệ còn thiếu cho từng quan hệ mời.'
      ]),
      block('faq-withdraw', ['什么时候可以提现？', 'When can I withdraw?', 'Khi nào có thể rút?'], [
        '以该笔奖励的释放状态与可提现余额为准。预估、待计算和冷却记录不等于可提现金额。',
        'Use the reward release status and withdrawable balance. Estimates, calculation-pending and cooling records are not withdrawable amounts.',
        'Theo trạng thái mở khóa của khoản thưởng và số dư có thể rút. Ước tính, chờ tính và đang chờ không phải số có thể rút.'
      ]),
      block('faq-reversal', ['退款后如何核对？', 'How do I check a refund adjustment?', 'Kiểm tra điều chỉnh hoàn tiền thế nào?'], [
        '原记录保留。净额应扣除已冲正、已拒绝或待追回部分，币种状态不一致时分别核对。',
        'Original records remain. Net amounts exclude reversed, rejected or recovery-pending portions; check each currency separately when statuses differ.',
        'Bản ghi gốc được giữ. Số ròng loại trừ phần đã đảo, bị từ chối hoặc chờ thu hồi; kiểm tra từng loại tiền khi trạng thái khác nhau.'
      ]),
      block('faq-cultivation', ['成员成长奖励发给谁？', 'Who receives a member growth reward?', 'Ai nhận thưởng phát triển thành viên?'], [
        '成员晋升触发对应奖励，发给该成员的推荐人；没有推荐人时由晋升成员本人获得。具体金额、币种和到账状态以奖励记录为准。',
        'A rank promotion triggers the corresponding reward for the member’s referrer. If there is no referrer, the promoted member receives it. Amount, currency and payment status follow reward records.',
        'Thăng hạng phát sinh phần thưởng tương ứng cho người giới thiệu. Nếu không có người giới thiệu, thành viên thăng hạng tự nhận. Số tiền, loại tiền và trạng thái chi trả theo bản ghi thưởng.'
      ]),
      block('footer', ['返回奖励记录', 'Back to reward records', 'Về bản ghi thưởng'], sameBody(sample)),
    ];
  }
  return {
    ...PROOF, contentKey: key, locale: language, version: 'prototype-team-guides-v1', versionSource: 'ENTRY', status: 'PUBLISHED', blocks,
    ...(key === 'team-binary-how' ? {} : { schemaVersion: 2, templateId: key === 'team-unilevel-how' ? 'unilevel-v2' : 'commissions-v2' }),
  };
}
