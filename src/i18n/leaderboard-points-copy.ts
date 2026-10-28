const COPY = {
  zh: {
    title: '邀请算力榜', points: '算力点', gap: '距上一名还差 {points}',
    unavailable: '算力排行暂不可用',
    note: '按所选周期的算力点从高到低排名。同分名次以榜单为准。',
    noteAll: '按累计算力点从高到低排名。同分名次以榜单为准。',
  },
  en: {
    title: 'Invite compute leaderboard', points: 'Compute points', gap: '{points} behind the next rank',
    unavailable: 'Compute ranking is currently unavailable',
    note: 'Ranked by compute points for the selected period, highest first. Tied positions follow the published ranking.',
    noteAll: 'Ranked by all-time compute points, highest first. Tied positions follow the published ranking.',
  },
  vi: {
    title: 'Bảng điểm tính toán giới thiệu', points: 'Điểm tính toán', gap: 'Còn {points} để đạt hạng kế tiếp',
    unavailable: 'Bảng xếp hạng điểm tính toán hiện chưa khả dụng',
    note: 'Xếp theo điểm tính toán trong kỳ đã chọn, từ cao xuống thấp. Thứ hạng đồng điểm theo bảng đã công bố.',
    noteAll: 'Xếp theo điểm tính toán tích lũy, từ cao xuống thấp. Thứ hạng đồng điểm theo bảng đã công bố.',
  },
};

export function leaderboardPointsCopy(locale: string) {
  return COPY[locale.split('-')[0] as keyof typeof COPY] ?? COPY.en;
}
