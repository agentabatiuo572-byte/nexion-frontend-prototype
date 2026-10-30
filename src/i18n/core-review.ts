// Copy isolated from shared dictionaries so concurrent domain edits stay small.
export const coreReviewCopy = {
  en: {
    fleetReadFailed: 'Devices could not be refreshed',
    fleetReadRetry: 'Device status is unavailable. Please try again.',
    earningsReadFailed: 'Earnings could not be refreshed.',
    statistics: 'Statistics', management: 'Device management', jobs: 'Job records',
    earningsHistory: 'Earnings history', onlineRate: 'Online rate',
    historyUnavailable: 'Earnings history is not available yet.',
    onlineRateUnavailable: 'Online rate is not available yet.',
    cumulativeEarnings: 'Total earned',
    supportHelp: 'Help & support',
    loadingActions: 'Loading next steps…', loadingOffers: 'Loading offers…',
    remaining: 'Time remaining', daysHours: '{days} days {hours} hr', daysHoursOneDay: '{days} day {hours} hr',
    hoursMinutesSeconds: '{hours} hr {minutes} min {seconds} sec',
    perDay: '/day', minutesSeconds: '{minutes} min {seconds} sec',
  },
  zh: {
    fleetReadFailed: '设备暂时无法刷新',
    fleetReadRetry: '暂无法读取设备状态，请重试。',
    earningsReadFailed: '收益暂时无法刷新。',
    statistics: '运行统计', management: '设备管理', jobs: '作业记录',
    earningsHistory: '历史收益', onlineRate: '在线率',
    historyUnavailable: '暂无历史收益数据。',
    onlineRateUnavailable: '暂无在线率数据。',
    cumulativeEarnings: '累计收益',
    supportHelp: '帮助与客服',
    loadingActions: '正在加载待办…', loadingOffers: '正在加载活动…',
    remaining: '剩余时间', daysHours: '{days} 天 {hours} 小时', daysHoursOneDay: '{days} 天 {hours} 小时',
    hoursMinutesSeconds: '{hours} 小时 {minutes} 分 {seconds} 秒',
    perDay: '/天', minutesSeconds: '{minutes} 分 {seconds} 秒',
  },
  vi: {
    fleetReadFailed: 'Chưa thể cập nhật thiết bị',
    fleetReadRetry: 'Chưa thể đọc trạng thái thiết bị. Vui lòng thử lại.',
    earningsReadFailed: 'Chưa thể cập nhật thu nhập.',
    statistics: 'Thống kê', management: 'Quản lý thiết bị', jobs: 'Lịch sử tác vụ',
    earningsHistory: 'Lịch sử thu nhập', onlineRate: 'Tỷ lệ trực tuyến',
    historyUnavailable: 'Chưa có dữ liệu lịch sử thu nhập.',
    onlineRateUnavailable: 'Chưa có dữ liệu tỷ lệ trực tuyến.',
    cumulativeEarnings: 'Tổng thu nhập',
    supportHelp: 'Trợ giúp & hỗ trợ',
    loadingActions: 'Đang tải việc cần làm…', loadingOffers: 'Đang tải ưu đãi…',
    remaining: 'Thời gian còn lại', daysHours: '{days} ngày {hours} giờ', daysHoursOneDay: '{days} ngày {hours} giờ',
    hoursMinutesSeconds: '{hours} giờ {minutes} phút {seconds} giây',
    perDay: '/ngày', minutesSeconds: '{minutes} phút {seconds} giây',
  },
};

export function formatTrialRemaining(ms: number, copy: Pick<typeof coreReviewCopy.en, 'daysHours' | 'daysHoursOneDay' | 'hoursMinutesSeconds'>): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const values: Record<string, number> = {
    days: Math.floor(seconds / 86400),
    hours: ms > 86400000 ? Math.floor(seconds / 3600) % 24 : Math.floor(seconds / 3600),
    minutes: Math.floor(seconds / 60) % 60,
    seconds: seconds % 60,
  };
  const template = ms > 86400000 ? (values.days === 1 ? copy.daysHoursOneDay : copy.daysHours) : copy.hoursMinutesSeconds;
  return template.replace(/\{(days|hours|minutes|seconds)\}/g, (_, key: string) => String(values[key]));
}
