import { expect, it } from 'vitest';
import { preserveRouteDuringSessionRestore } from './session-restore-route';

it('keeps business deep links during cookie restoration, including public promotions', () => {
  for (const path of ['pages/events/events', 'pages/store/store', 'pages/store/detail', 'pages/store/checkout', 'pages/store/order-detail', 'pages/events/promotion-rewards', 'pages/onboarding/privacy']) {
    expect(preserveRouteDuringSessionRestore('/' + path + '?activityId=original')).toBe(true);
  }
});
it('retains the existing reset for authentication entries and an absent route', () => {
  for (const path of ['', 'pages/login/login', 'pages/register/register', 'pages/onboarding/intro']) {
    expect(preserveRouteDuringSessionRestore(path)).toBe(false);
  }
});
