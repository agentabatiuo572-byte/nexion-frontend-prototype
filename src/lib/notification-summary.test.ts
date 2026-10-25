import { describe, expect, it } from 'vitest';
import { isDirectNotificationSummary } from './notification-summary';

describe('conservative notification reading budget', () => {
  it.each([undefined, '', '已到账。', 'View order.', 'Xem đơn.'])('permits a brief summary: %s', body => {
    expect(isDirectNotificationSummary(body)).toBe(true);
  });
  it.each(['汉'.repeat(80), '汉'.repeat(100), 'W'.repeat(25), 'A detailed notification needs to be read before opening the linked order.', 'Thông báo này chứa thông tin chi tiết cần đọc trước khi mở đơn hàng.', '短文\n正文', '短文\r正文', 'text\u2028body', '🔔'.repeat(20)])('keeps longer or multiline text expandable: %s', body => {
    expect(isDirectNotificationSummary(body)).toBe(false);
  });
});
