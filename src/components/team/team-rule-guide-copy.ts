const copy = {
  zh: {
    overview: '玩法概览',
    title: '先看奖励来源，再核对结算',
    intro: '购买奖励与设备收益奖励分别适用不同规则。',
    sources: '哪些记录适用',
    direct: '直属购买', directBody: '直接邀请成员的合格购买记录，按对应购买奖励规则结算。',
    network: '网络购买', networkBody: '间接邀请成员的合格购买记录，按适用范围与资格计算。',
    device: '设备收益', deviceBody: '仅直接邀请成员的设备收益适用；平台额外支付，成员原收益不扣减。',
    settlement: '怎样核对到账', settlementBody: '分别核对 USDT 与 UVT 金额、记录状态和预计解锁时间。付款不代表奖励已到账。',
    references: '在哪里查看明细', referencesBody: '在奖励记录中展开详情，可查看订单或收益凭证、结算编号及相关时间。',
    networkRule: '网络购买奖励按适用范围与当前规则结算，金额及到账状态以实际结算记录为准。',
    contents: '按主题阅读', fullText: '完整发布说明', expandAll: '展开全部', collapseAll: '收起全部',
    guideHint: '点开标题查看完整说明，或一次展开全部。',
  },
  en: {
    overview: 'At a glance',
    title: 'Understand the source. Check the settlement.',
    intro: 'Purchase rewards and device earnings follow their respective rules.',
    sources: 'Which records qualify',
    direct: 'Direct purchases', directBody: 'Eligible purchases by members you invited directly follow the applicable purchase reward rules.',
    network: 'Network purchases', networkBody: 'Eligible purchases by indirectly invited members follow the applicable scope and eligibility rules.',
    device: 'Device earnings', deviceBody: 'Only directly invited members qualify. The platform pays extra; members keep their original earnings.',
    settlement: 'Check payment', settlementBody: 'Check USDT and UVT amounts, record status and expected unlock time separately. A purchase payment does not mean the reward has arrived.',
    references: 'Find the details', referencesBody: 'Expand a reward record to see its order or earnings reference, settlement ID and relevant dates.',
    networkRule: 'Network purchase rewards follow the applicable scope and current rules. Check settlement records for amounts and payment status.',
    contents: 'Read by topic', fullText: 'Full published guide', expandAll: 'Expand all', collapseAll: 'Collapse all',
    guideHint: 'Open a heading for the full explanation, or expand all topics.',
  },
  vi: {
    overview: 'Tổng quan',
    title: 'Hiểu nguồn thưởng. Kiểm tra quyết toán.',
    intro: 'Thưởng mua hàng và thu nhập thiết bị áp dụng quy tắc riêng.',
    sources: 'Bản ghi nào đủ điều kiện',
    direct: 'Mua trực tiếp', directBody: 'Giao dịch mua đủ điều kiện của thành viên bạn mời trực tiếp áp dụng quy tắc thưởng mua tương ứng.',
    network: 'Mua trong mạng lưới', networkBody: 'Giao dịch mua đủ điều kiện của thành viên được mời gián tiếp áp dụng phạm vi và điều kiện tương ứng.',
    device: 'Thu nhập thiết bị', deviceBody: 'Chỉ áp dụng cho thành viên được mời trực tiếp. Nền tảng trả thêm; thành viên giữ nguyên thu nhập.',
    settlement: 'Kiểm tra khoản chi trả', settlementBody: 'Kiểm tra riêng số tiền USDT và UVT, trạng thái bản ghi và thời gian mở khóa dự kiến. Thanh toán mua hàng không có nghĩa là đã nhận thưởng.',
    references: 'Tìm thông tin chi tiết', referencesBody: 'Mở chi tiết bản ghi thưởng để xem mã đơn hàng hoặc thu nhập, mã quyết toán và các mốc thời gian liên quan.',
    networkRule: 'Thưởng mua trong mạng lưới theo phạm vi áp dụng và quy tắc hiện hành. Xem bản ghi quyết toán để kiểm tra số tiền và trạng thái chi trả.',
    contents: 'Đọc theo chủ đề', fullText: 'Hướng dẫn đã công bố đầy đủ', expandAll: 'Mở tất cả', collapseAll: 'Thu gọn tất cả',
    guideHint: 'Mở tiêu đề để đọc đầy đủ hoặc mở tất cả chủ đề.',
  },
};

export function teamRuleGuideCopy(locale: string) {
  return copy[locale.split(/[-_]/)[0] as keyof typeof copy] ?? copy.en;
}
