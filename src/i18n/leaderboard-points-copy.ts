const COPY = {
  zh: {
    title: '邀请榜', points: '算力点', gap: '距上一名还差 {points}',
    unavailable: '算力排行暂不可用',
    note: '按所选周期的算力点排名。榜单奖励在周期结束后发放，以实际到账为准。',
    noteAll: '按累计算力点排名。',
  },
  en: {
    title: 'Invite leaderboard', points: 'Compute points', gap: '{points} behind the next rank',
    unavailable: 'Compute ranking is currently unavailable',
    note: 'Ranked by compute points for the selected period. Leaderboard rewards are paid after the period ends, subject to actual payout.',
    noteAll: 'Ranked by all-time compute points.',
  },
  vi: {
    title: 'Bảng xếp hạng mời', points: 'Điểm tính toán', gap: 'Còn {points} để đạt hạng kế tiếp',
    unavailable: 'Bảng xếp hạng điểm tính toán hiện chưa khả dụng',
    note: 'Xếp hạng theo điểm tính toán trong kỳ đã chọn. Thưởng bảng xếp hạng được chi trả sau khi kỳ kết thúc, theo số tiền thực nhận.',
    noteAll: 'Xếp hạng theo tổng điểm tính toán tích lũy.',
  },
};

export function leaderboardPointsCopy(locale: string) {
  return COPY[locale.split('-')[0] as keyof typeof COPY] ?? COPY.en;
}
