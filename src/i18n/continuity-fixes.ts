export function continuityCopy(language: string) {
  return ({
    zh: {
      trustRefreshing: '正在更新资料，当前显示上次内容。',
      trustRefreshFailed: '资料更新失败，当前显示上次内容。请重试。',
      tomorrowBaseReward: '明日签到基础奖励 +{n} UVT',
    },
    en: {
      trustRefreshing: 'Updating information. Previously loaded content is shown.',
      trustRefreshFailed: 'Could not update information. Previously loaded content is shown. Please retry.',
      tomorrowBaseReward: 'Tomorrow’s base check-in reward: +{n} UVT',
    },
    vi: {
      trustRefreshing: 'Đang cập nhật thông tin. Nội dung đã tải trước đó vẫn được hiển thị.',
      trustRefreshFailed: 'Không thể cập nhật thông tin. Nội dung đã tải trước đó vẫn được hiển thị. Vui lòng thử lại.',
      tomorrowBaseReward: 'Thưởng điểm danh cơ bản ngày mai: +{n} UVT',
    },
  })[language === 'zh' || language === 'vi' ? language : 'en'];
}
