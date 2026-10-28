import type { LocaleCode } from '@/i18n';
import type { CommissionKind } from '@/store/commission';

const copy: Record<'zh' | 'en' | 'vi', { title: string; all: string; kinds: Record<CommissionKind, string> }> = {
  zh: { title: '奖励类型', all: '全部', kinds: { direct_purchase: '邀请购机', direct_device_earning: '邀请设备收益', unilevel: '团队购机', binary: '双区贡献', peer: '协作奖励', cultivation: '成员成长', leadership: '团队激励', genesis: '创世节点', promotion: '晋升奖励', other: '其他' } },
  en: { title: 'Reward type', all: 'All', kinds: { direct_purchase: 'Referral purchase', direct_device_earning: 'Referral earnings', unilevel: 'Team purchase', binary: 'Group contribution', peer: 'Collaboration', cultivation: 'Member growth', leadership: 'Team incentive', genesis: 'Genesis node', promotion: 'Rank reward', other: 'Other' } },
  vi: { title: 'Loại thưởng', all: 'Tất cả', kinds: { direct_purchase: 'Mời mua máy', direct_device_earning: 'Thu nhập giới thiệu', unilevel: 'Nhóm mua máy', binary: 'Đóng góp hai nhóm', peer: 'Hợp tác', cultivation: 'Thành viên phát triển', leadership: 'Khuyến khích nhóm', genesis: 'Nút khởi nguyên', promotion: 'Thăng hạng', other: 'Khác' } },
};
export const commissionFilterCopy = (locale: LocaleCode) => copy[locale === 'zh' || locale === 'vi' ? locale : 'en'];
