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
  const rankConfig = read('/api/config/v-ranks');
  const binary = read('/api/team/binary');
  const pool = read('/api/app/team/insights/leadership-pool');
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

  // Same text as the backend default publications (APP-COPY-AUDIT 2026-10-29), so the
  // prototype shows what users see before operations publish their own version.
  const block = (id, kind, title, body, items) => ({ id, kind, title, body, ...(items ? { items } : {}) });
  let blocks;
  if (key === 'team-unilevel-how') {
    blocks = [
      block('hero', 'text', text('团队奖励', 'Team rewards', 'Thưởng nhóm'), text(
        '好友和团队成员购买设备，你都能获得奖励；好友的设备产生收益时，你还能额外获得奖励。',
        'You earn when friends and team members buy devices, and you earn extra when your friends\u2019 devices produce earnings.',
        'Bạn nhận thưởng khi bạn bè và thành viên nhóm mua thiết bị, và nhận thêm thưởng khi thiết bị của bạn bè tạo thu nhập.')),
      block('seven-layer-scope', 'text', text('购买奖励', 'Purchase rewards', 'Thưởng mua hàng'), text(
        '你邀请的好友购买设备，你获得好友购买奖励；团队其他成员购买，你获得团队购买奖励。等级越高，可获得奖励的范围越大，具体比例见等级页。',
        'When a friend you invited buys a device, you earn a friend purchase reward. When other team members buy, you earn a team purchase reward. Higher ranks widen your reward reach; see the rank page for current rates.',
        'Khi bạn bè bạn mời mua thiết bị, bạn nhận thưởng bạn bè mua hàng. Khi các thành viên khác trong nhóm mua, bạn nhận thưởng nhóm mua hàng. Hạng càng cao, phạm vi nhận thưởng càng rộng; xem tỷ lệ hiện hành tại trang hạng.')),
      block('direct-referral-scope', 'text', text('好友设备收益奖励', 'Friend device earnings reward', 'Thưởng thu nhập thiết bị của bạn bè'), text(
        '你邀请的好友设备产生收益时，平台额外发给你一份奖励，不影响好友自己的收益。',
        'When your friends\u2019 devices produce earnings, the platform pays you an extra reward without reducing their earnings.',
        'Khi thiết bị của bạn bè tạo thu nhập, nền tảng chi trả thêm cho bạn một khoản thưởng mà không làm giảm thu nhập của họ.')),
      block('payout', 'text', text('到账', 'Payouts', 'Chi trả'), text(
        '奖励以 USDT 和 UVT 发放，待到账期结束后可以提现。',
        'Rewards are paid in USDT and UVT and can be withdrawn after the pending period.',
        'Thưởng được chi trả bằng USDT và UVT, có thể rút sau thời gian chờ.')),
      block('note', 'callout', text('需要了解', 'Good to know', 'Lưu ý'), text(
        '金额以奖励明细为准；规则如有调整，以平台最新公布为准。',
        'Amounts follow your reward history. If the rules change, the latest published rules apply.',
        'Số tiền theo lịch sử thưởng của bạn. Nếu quy tắc thay đổi, quy tắc mới nhất do nền tảng công bố sẽ được áp dụng.')),
    ];
  } else if (key === 'team-binary-how') {
    blocks = [
      block('hero', 'text', text('团队平衡奖励', 'Team Balance Reward', 'Thưởng cân bằng nhóm'), text(
        '你的团队成员分在 A、B 两组。两组都有订单时，按较小一组的订单额发放奖励——两组越均衡，奖励越多。',
        'Your team is split into Group A and Group B. When both groups have orders, you earn a reward based on the smaller group\u2019s order volume. The more balanced the groups, the more you earn.',
        'Thành viên trong nhóm của bạn được chia thành nhóm A và nhóm B. Khi cả hai nhóm đều có đơn hàng, bạn nhận thưởng tính theo doanh số của nhóm nhỏ hơn. Hai nhóm càng cân bằng, thưởng càng nhiều.')),
      block('how-to-earn', 'list', text('怎么拿到奖励', 'How to earn', 'Cách nhận thưởng'), text('三步拿到奖励：', 'Three steps to earn:', 'Ba bước để nhận thưởng:'), [
        text('邀请好友加入，他们和他们邀请的人会分到 A 组或 B 组。', 'Invite friends. They and the people they invite are placed in Group A or Group B.', 'Mời bạn bè tham gia. Bạn bè và những người họ mời sẽ được xếp vào nhóm A hoặc nhóm B.'),
        text('两组订单额都达到发放条件后开始计算。', 'Rewards start once both groups reach the required order volume.', 'Thưởng bắt đầu được tính khi doanh số của cả hai nhóm đạt mức yêu cầu.'),
        text('比例和发放周期以奖励页显示为准。', 'The current rate and payout schedule are shown on the reward page.', 'Tỷ lệ và kỳ chi trả hiện hành được hiển thị trên trang thưởng.'),
      ]),
      block('earn-more', 'text', text('怎样拿更多', 'Earn more', 'Cách tăng thưởng'), text(
        '让两组一起成长。较小一组决定奖励，它的订单额增加，奖励随之增加。',
        'Keep both groups growing. The smaller group sets your reward, so as its volume grows, so does your reward.',
        'Hãy duy trì đà tăng trưởng của cả hai nhóm. Nhóm nhỏ hơn quyết định mức thưởng, vì vậy khi doanh số nhóm này tăng, thưởng của bạn cũng tăng theo.')),
      block('note', 'callout', text('需要了解', 'Good to know', 'Lưu ý'), text(
        '页面显示的是预计金额，实际以发放记录为准。规则如有调整，以平台最新公布为准。',
        'Amounts shown are estimates; actual rewards follow your payout records. If the rules change, the latest published rules apply.',
        'Số tiền hiển thị là ước tính; thưởng thực nhận theo bản ghi chi trả. Nếu quy tắc thay đổi, quy tắc mới nhất do nền tảng công bố sẽ được áp dụng.')),
    ];
  } else {
    // commissions-v2 renders fixed slots, so every slot id stays; only the wording is the default copy.
    const slot = (id, titles, bodies) => block(id, 'text', text(...titles), text(...bodies));
    blocks = [
      slot('hero', ['奖励明细说明', 'About your reward history', 'Giới thiệu lịch sử thưởng'], ['这里记录你的全部奖励，按来源和状态分别显示。', 'All your rewards are recorded here, shown by source and status.', 'Tất cả khoản thưởng của bạn được ghi nhận tại đây, hiển thị theo nguồn và trạng thái.']),
      slot('overview', ['奖励从哪来', 'Where rewards come from', 'Thưởng đến từ đâu'], ['好友购买、团队购买、好友设备收益、团队平衡奖励、同级奖励、好友升级奖励和团队激励池。', 'Friend purchases, team purchases, friends\u2019 device earnings, the Team Balance Reward, same-rank rewards, friend rank-up rewards and the team incentive pool.', 'Bạn bè mua hàng, nhóm mua hàng, thu nhập thiết bị của bạn bè, thưởng cân bằng nhóm, thưởng đồng cấp, thưởng khi bạn bè lên hạng và quỹ thưởng nhóm.']),
      slot('channels', ['分别查看', 'Shown separately', 'Hiển thị riêng'], ['不同来源的奖励分开记录，金额以每条记录为准。', 'Rewards from each source are recorded separately; each record shows the amount.', 'Thưởng từ mỗi nguồn được ghi nhận riêng; số tiền theo từng bản ghi.']),
      slot('network', ['好友和团队购买', 'Friend and team purchases', 'Bạn bè và nhóm mua hàng'], ['好友购买：{directPurchaseRules}。团队购买：{networkPurchaseRules}。好友设备收益：{directDeviceRules}。', 'Friend purchases: {directPurchaseRules}. Team purchases: {networkPurchaseRules}. Friends\u2019 device earnings: {directDeviceRules}.', 'Bạn bè mua hàng: {directPurchaseRules}. Nhóm mua hàng: {networkPurchaseRules}. Thu nhập thiết bị của bạn bè: {directDeviceRules}.']),
      slot('binary', ['团队平衡奖励', 'Team Balance Reward', 'Thưởng cân bằng nhóm'], ['按较小一组的订单额发放。', 'Paid on the smaller group\u2019s order volume.', 'Chi trả theo doanh số của nhóm nhỏ hơn.']),
      slot('peer', ['同级奖励', 'Same-rank reward', 'Thưởng đồng cấp'], ['以实际发放为准。', 'Subject to actual payout.', 'Theo kết quả chi trả thực tế.']),
      slot('cultivation', ['好友升级奖励', 'Friend rank-up reward', 'Thưởng khi bạn bè lên hạng'], ['好友升级时发放。', 'Paid when a friend ranks up.', 'Chi trả khi bạn bè lên hạng.']),
      slot('leadership', ['团队激励池', 'Team incentive pool', 'Quỹ thưởng nhóm'], ['按票数每周发放。', 'Paid weekly by votes.', 'Chi trả hằng tuần theo số phiếu.']),
      slot('genesis', ['创世节点奖励', 'Genesis rewards', 'Thưởng Genesis'], ['{genesisStatus}', '{genesisStatus}', '{genesisStatus}']),
      slot('lifecycle', ['状态怎么看', 'Record status', 'Trạng thái bản ghi'], ['每条奖励都会标出状态，金额以记录为准。', 'Each reward shows its status; the amount follows the record.', 'Mỗi khoản thưởng đều hiển thị trạng thái; số tiền theo bản ghi.']),
      slot('cooling', ['待到账', 'Pending', 'Chờ ghi nhận'], ['等待期结束后可提现，不同来源的等待期可能不同。', 'Withdrawable after the waiting period, which can differ by source.', 'Có thể rút sau thời gian chờ; thời gian chờ có thể khác nhau tùy nguồn.']),
      slot('unlocked', ['已到账', 'Credited', 'Đã ghi nhận'], ['可以提现。', 'Ready to withdraw.', 'Có thể rút.']),
      slot('withdrawn', ['已提现', 'Withdrawn', 'Đã rút'], ['已转入提现，到账情况见提现记录。', 'Moved into a withdrawal; see your withdrawal records for its status.', 'Đã chuyển vào lệnh rút; xem trạng thái trong lịch sử rút tiền.']),
      slot('cooling-note', ['已撤销', 'Reversed', 'Đã hủy'], ['订单退款等情况下，对应奖励会撤销。', 'A reward is reversed if, for example, its order is refunded.', 'Khoản thưởng sẽ bị hủy nếu, chẳng hạn, đơn hàng được hoàn tiền.']),
      slot('example', ['算例', 'Example', 'Ví dụ'], ['以下以 {exampleBase} 的订单为例，仅作说明，不代表个人到账。', 'The example below uses a {exampleBase} order for illustration only; it isn\u2019t a personal payout.', 'Ví dụ dưới đây dùng đơn hàng {exampleBase} chỉ để minh họa, không phải khoản bạn nhận.']),
      slot('example-day', ['假设订单', 'Example order', 'Đơn hàng ví dụ'], ['{exampleBase}', '{exampleBase}', '{exampleBase}']),
      slot('example-network', ['好友和团队购买奖励', 'Friend and team purchase rewards', 'Thưởng bạn bè và nhóm mua hàng'], ['以实际发放为准。', 'Subject to actual payout.', 'Theo kết quả chi trả thực tế.']),
      slot('example-cultivation', ['好友升级奖励', 'Friend rank-up reward', 'Thưởng khi bạn bè lên hạng'], ['{exampleRank}', '{exampleRank}', '{exampleRank}']),
      slot('example-peer', ['同级奖励', 'Same-rank reward', 'Thưởng đồng cấp'], ['{peerStatus}', '{peerStatus}', '{peerStatus}']),
      slot('example-leadership', ['团队激励池', 'Team incentive pool', 'Quỹ thưởng nhóm'], ['以实际发放为准。', 'Subject to actual payout.', 'Theo kết quả chi trả thực tế.']),
      slot('example-total', ['合计', 'Total', 'Tổng cộng'], ['不同币种和状态不直接相加。', 'Different currencies and statuses aren\u2019t added together.', 'Không cộng chung các loại tiền và trạng thái khác nhau.']),
      slot('example-note', ['说明', 'Note', 'Lưu ý'], ['算例仅作说明，实际以奖励记录为准。', 'The example is for illustration only; actual amounts follow your reward records.', 'Ví dụ chỉ để minh họa; số tiền thực tế theo lịch sử thưởng.']),
      slot('faq', ['常见问题', 'Common questions', 'Câu hỏi thường gặp'], ['关于奖励到账的常见疑问。', 'Questions about receiving rewards.', 'Các thắc mắc thường gặp về việc nhận thưởng.']),
      slot('faq-order', ['为什么没看到奖励？', 'Why don\u2019t I see a reward?', 'Vì sao chưa thấy thưởng?'], ['奖励在订单确认后生成，可能还在待到账期，可在奖励明细中查看对应记录。', 'Rewards are created after an order is confirmed and may still be pending. Check the record in your reward history.', 'Thưởng được tạo sau khi đơn hàng được xác nhận và có thể vẫn đang chờ ghi nhận. Vui lòng xem bản ghi trong lịch sử thưởng.']),
      slot('faq-withdraw', ['什么时候可以提现？', 'When can I withdraw?', 'Khi nào có thể rút?'], ['奖励到账后即可提现，待到账的奖励暂不可提现。', 'Once a reward is credited, you can withdraw it. Pending rewards can\u2019t be withdrawn yet.', 'Thưởng đã ghi nhận có thể rút ngay; thưởng đang chờ chưa thể rút.']),
      slot('faq-reversal', ['退款后奖励会怎样？', 'What happens after a refund?', 'Điều gì xảy ra khi hoàn tiền?'], ['订单退款后，对应的奖励会撤销。', 'If an order is refunded, its reward is reversed.', 'Khi đơn hàng được hoàn tiền, khoản thưởng tương ứng sẽ bị hủy.']),
      slot('faq-cultivation', ['好友升级奖励发给谁？', 'Who gets the friend rank-up reward?', 'Ai nhận thưởng khi bạn bè lên hạng?'], ['发给邀请这位好友的人。', 'The person who invited that friend.', 'Người đã mời người bạn đó.']),
      slot('footer', ['返回奖励明细', 'Back to reward history', 'Về lịch sử thưởng'], ['金额以奖励记录为准；规则如有调整，以平台最新公布为准。', 'Amounts follow your reward records. If the rules change, the latest published rules apply.', 'Số tiền theo lịch sử thưởng. Nếu quy tắc thay đổi, quy tắc mới nhất do nền tảng công bố sẽ được áp dụng.']),
    ];
  }
  return {
    ...PROOF, contentKey: key, locale: language, version: 'default-2026.10.29', versionSource: 'ENTRY', status: 'PUBLISHED', blocks,
    ...(key === 'team-binary-how' ? {} : { schemaVersion: 2, templateId: key === 'team-unilevel-how' ? 'unilevel-v2' : 'commissions-v2' }),
  };
}
