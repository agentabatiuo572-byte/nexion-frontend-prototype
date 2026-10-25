export const searchRecoveryCopy = {
  zh: { unavailable: '搜索资料暂时无法加载', retryHint: '搜索资料未能完整加载，请重试后再确认结果。', partial: '部分搜索资料未能加载，以下结果仍可查看。' },
  en: { unavailable: 'Search information is unavailable', retryHint: 'Some search information could not be loaded. Retry to check the full results.', partial: 'Some search information could not be loaded. Available results are still shown.' },
  vi: { unavailable: 'Chưa tải được thông tin tìm kiếm', retryHint: 'Chưa tải đủ thông tin tìm kiếm. Thử lại để kiểm tra đầy đủ kết quả.', partial: 'Chưa tải được một phần thông tin. Bạn vẫn có thể xem các kết quả hiện có.' },
};

export function searchCopyFor(locale: string) {
  return searchRecoveryCopy[locale === 'zh' || locale === 'vi' ? locale : 'en'];
}
