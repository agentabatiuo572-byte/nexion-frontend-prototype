const copy = {
  zh: {
    overview: '玩法概览',
    title: '奖励从哪来、何时到账',
    intro: '好友和团队购买设备、好友的设备收益，都能为你带来奖励。',
    sources: '奖励来源',
    direct: '好友购买', directBody: '你邀请的好友购买设备，你获得好友购买奖励。',
    network: '团队购买', networkBody: '团队其他成员购买设备，你获得团队购买奖励，范围随等级提升而扩大。',
    device: '好友设备收益', deviceBody: '好友的设备产生收益时，平台额外给你一份奖励，不影响好友自己的收益。',
    settlement: '何时到账', settlementBody: '奖励以 USDT 和 UVT 发放，待到账期结束后可提现。',
    references: '在哪里查看', referencesBody: '在奖励明细中展开记录，可查看对应订单和时间。',
    networkRule: '团队购买奖励以实际发放为准。',
    contents: '按主题阅读', fullText: '完整发布说明',
  },
  en: {
    overview: 'At a glance',
    title: 'Where rewards come from and when they arrive',
    intro: 'You earn when friends and team members buy devices, and when your friends’ devices earn.',
    sources: 'Reward sources',
    direct: 'Friend purchases', directBody: 'When a friend you invited buys a device, you earn a friend purchase reward.',
    network: 'Team purchases', networkBody: 'When other team members buy devices, you earn a team purchase reward. Your reach grows as you rank up.',
    device: 'Friends’ device earnings', deviceBody: 'When your friends’ devices earn, the platform pays you an extra reward without reducing their earnings.',
    settlement: 'When rewards arrive', settlementBody: 'Rewards are paid in USDT and UVT and can be withdrawn after the pending period.',
    references: 'Where to check', referencesBody: 'Open a record in your reward history to see the related order and date.',
    networkRule: 'Team purchase rewards are subject to actual payout.',
    contents: 'Read by topic', fullText: 'Full published guide',
  },
  vi: {
    overview: 'Tổng quan',
    title: 'Thưởng đến từ đâu và khi nào được ghi nhận',
    intro: 'Bạn nhận thưởng khi bạn bè và thành viên nhóm mua thiết bị, và khi thiết bị của bạn bè tạo thu nhập.',
    sources: 'Nguồn thưởng',
    direct: 'Bạn bè mua hàng', directBody: 'Khi bạn bè bạn mời mua thiết bị, bạn nhận thưởng bạn bè mua hàng.',
    network: 'Nhóm mua hàng', networkBody: 'Khi các thành viên khác trong nhóm mua thiết bị, bạn nhận thưởng nhóm mua hàng. Phạm vi nhận thưởng mở rộng khi bạn lên hạng.',
    device: 'Thu nhập thiết bị của bạn bè', deviceBody: 'Khi thiết bị của bạn bè tạo thu nhập, nền tảng chi trả thêm cho bạn một khoản thưởng mà không làm giảm thu nhập của họ.',
    settlement: 'Khi nào được ghi nhận', settlementBody: 'Thưởng được chi trả bằng USDT và UVT, có thể rút sau thời gian chờ.',
    references: 'Xem ở đâu', referencesBody: 'Mở một bản ghi trong lịch sử thưởng để xem đơn hàng và thời gian liên quan.',
    networkRule: 'Thưởng nhóm mua hàng theo kết quả chi trả thực tế.',
    contents: 'Đọc theo chủ đề', fullText: 'Hướng dẫn đã công bố đầy đủ',
  },
};

export function teamRuleGuideCopy(locale: string) {
  return copy[locale.split(/[-_]/)[0] as keyof typeof copy] ?? copy.en;
}
