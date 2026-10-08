import { describe, expect, it } from 'vitest';
import { safeReturnTo } from './safe-return-to';

describe('login return route transport', () => {
  const target = '/pages/store/checkout?activityId=activity-1&items=%5B%7B%22productNo%22%3A%22sku%22%2C%22quantity%22%3A2%7D%5D';
  it('preserves the activity and nested item payload through Uni H5 encoding', () => {
    for (const raw of [target, encodeURIComponent(target), encodeURIComponent(encodeURIComponent(target))]) {
      expect(safeReturnTo(raw, '/pages/index/index')).toBe(target);
    }
  });
  it.each(['https://evil.example', '//evil.example', '/\\evil.example', '/%2fevil.example', '/%5cevil.example', 'javascript:alert(1)', '%', '/pages/store%0a/checkout'])('rejects an unsafe return even when encoded: %s', raw => {
    for (const value of [raw, encodeURIComponent(raw)]) expect(safeReturnTo(value, '/fallback')).toBe('/fallback');
  });
});
