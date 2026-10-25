import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api-client';
import { createNotificationApi } from './notification-api';
import { createOrderApi } from './order-api';
import { createDeviceE3Api } from './device-e3-api';
import { isDirectNotificationSummary } from '@/lib/notification-summary';

const { demoFixture, demoDefaults } = await import(new URL('../../scripts/lib/prototype-demo-data.mjs', import.meta.url).href);
function demo(locale: string) {
  const state = structuredClone(demoDefaults);
  const client = { request: async (input: { path: string; body?: unknown; method?: string; idempotencyKey?: string }) => demoFixture(
    new URL(input.path, 'http://prototype.invalid'), locale, state,
    { postDataJSON: () => input.body, method: () => input.method ?? 'GET', headers: () => ({ 'idempotency-key': input.idempotencyKey }) },
  ) } as ApiClient;
  return { state, client, api: createNotificationApi(client) };
}
afterEach(() => vi.useRealTimers());

describe('prototype notification record contracts', () => {
  it.each(['zh', 'en', 'vi'])('links %s notifications and actions to existing demo records', async locale => {
    const d = demo(locale);
    const page = await d.api.page();
    const orders = await createOrderApi(d.client).list();
    const fleet = await createDeviceE3Api(d.client).fleet();
    const orderNotice = page.items.find(item => item.id === 902)!;
    const deviceNotice = page.items.find(item => item.id === 901)!;
    const orderId = new URL(orderNotice.ctaHref, 'http://prototype.invalid').searchParams.get('id');
    const deviceId = new URL(deviceNotice.ctaHref, 'http://prototype.invalid').searchParams.get('id');
    const order = orders.orders.find(item => item.orderNo === orderId)!;
    const device = fleet.devices.find(item => String(item.id) === deviceId)!;
    expect(order).toBeDefined(); expect(device).toBeDefined();
    expect(orderNotice.body).toContain(order.orderNo); expect(orderNotice.body).toContain('USDT');
    expect(deviceNotice.body).toContain(device.instanceNo);
    for (const notice of [orderNotice, deviceNotice]) {
      for (const action of ['cta', 'swipe_conversion'] as const) {
        const key = `demo-${notice.id}-${action}`;
        const result = await d.api.recordAction(notice.id, action, key);
        expect(result.route).toBe(notice.ctaHref);
        expect(await d.api.recordAction(notice.id, action, key)).toEqual(result);
      }
    }
    const short = page.items.find(item => item.id === 903)!;
    expect(short.ctaHref).toBeTruthy(); expect(isDirectNotificationSummary(short.body)).toBe(true);
    const long = page.items.find(item => item.id === 905)!;
    expect(long.ctaHref).toBe(''); expect(long.body).toContain('\n'); expect(isDirectNotificationSummary(long.body)).toBe(false);
    await expect(d.api.recordAction(long.id, 'cta', 'no-link-action')).rejects.toThrow('DEMO_NOTIFICATION_ACTION_UNAVAILABLE');
  });
  it('has today, yesterday and older groups even just after local midnight', async () => {
    vi.useFakeTimers(); const today = new Date(2026, 9, 25, 0, 1); vi.setSystemTime(today);
    const d = demo('zh'); const page = await d.api.page();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const dates = page.items.map(item => new Date(item.createdAt).toDateString());
    expect(dates).toContain(today.toDateString()); expect(dates).toContain(yesterday.toDateString());
    expect(new Set(dates).size).toBeGreaterThan(2);
    expect(page.items.map(item => item.createdAt)).toEqual(page.items.map(item => item.createdAt).sort((a, b) => b - a));
    expect(page.items.every(item => item.createdAt <= Date.now())).toBe(true);
  });
  it('clears only read rows, preserves unread counts and keeps independent demo accounts isolated', async () => {
    const a = demo('en'), b = demo('en');
    await a.api.markRead(901); await a.api.markRead(901);
    expect((await a.api.page()).unread).toBe(2);
    expect(await a.api.clearRead()).toBe(3); expect(await a.api.clearRead()).toBe(0);
    expect((await a.api.page()).items.map(item => item.id)).toEqual([903, 902]);
    expect((await b.api.page()).items).toHaveLength(5); expect((await b.api.page()).unread).toBe(3);
  });
});
