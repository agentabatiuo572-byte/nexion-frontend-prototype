import { describe, expect, it } from 'vitest';
import { coreReviewCopy, formatTrialRemaining } from './core-review';
import { en } from './messages/en';
import { zh } from './messages/zh';
import { vi } from './messages/vi';

describe('trial remaining duration', () => {
  it.each([
    ['zh', 2 * 86400000 + 3600000 + 59000, '2 天 1 小时'],
    ['en', 2 * 86400000 + 3600000, '2 days 1 hr'],
    ['en', 86400001, '1 day 0 hr'],
    ['vi', 2 * 86400000 + 3600000, '2 ngày 1 giờ'],
    ['zh', 86400001, '1 天 0 小时'],
    ['zh', 86400000, '24 小时 0 分 0 秒'],
    ['zh', 86399000, '23 小时 59 分 59 秒'],
    ['en', 3661000, '1 hr 1 min 1 sec'],
    ['vi', 3661000, '1 giờ 1 phút 1 giây'],
    ['zh', -1000, '0 小时 0 分 0 秒'],
  ] as const)('%s formats %d without changing the deadline', (locale, ms, expected) => {
    expect(formatTrialRemaining(ms, coreReviewCopy[locale])).toBe(expected);
  });
  it('does not tick seconds on a multi-day trial', () => {
    for (const copy of Object.values(coreReviewCopy)) {
      expect(formatTrialRemaining(172859000, copy)).toBe(formatTrialRemaining(172858000, copy));
      expect(formatTrialRemaining(59000, copy)).not.toBe(formatTrialRemaining(58000, copy));
    }
  });
});

it('keeps compute job and receipt copy distinct from gameplay quests', () => {
  expect(zh.earn.taskCenter).toBe('作业中心');
  expect(zh.earn.taskPoolLineTitle).toContain('作业池');
  expect(JSON.stringify(zh.earn)).not.toContain('任务');
  expect(zh.taskHistory.historyHint).toContain('作业');
  expect(zh.taskHistory.historyHint).not.toContain('任务');
  expect(zh.receipt.computeEmptyHint).toContain('作业');
  expect(zh.missions.heroSubtitle).toContain('任务');
  expect(en.earn.taskCenter).toBe('Job Center');
  expect(vi.taskHistory.historyHint).not.toContain('Proof-of-Compute');
});

it('read failure makes no settlement or compensation promise', () => {
  for (const copy of [en, zh, vi]) {
    const message = copy.wallet.syncFailedBody + copy.coreReview.fleetReadRetry;
    expect(message).not.toMatch(/补算|结算已暂停|catch up|settlement is paused|tính bù|Quyết toán thu nhập tạm dừng/);
  }
});
