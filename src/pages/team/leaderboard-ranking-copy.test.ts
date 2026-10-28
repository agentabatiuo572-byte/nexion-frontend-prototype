// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fmt } from '@/i18n/format';
import { formatComputePoints } from '@/i18n/compute-points';
import { leaderboardPointsCopy } from '@/i18n/leaderboard-points-copy';
import { en } from '@/i18n/messages/en';
import { zh } from '@/i18n/messages/zh';
import { vi } from '@/i18n/messages/vi';

const source = readFileSync(new URL('./leaderboard.vue', import.meta.url), 'utf8');
const gapExpression = source.match(/const gapText = computed\(\(\) => ([\s\S]*?)\);/)?.[1];
if (!gapExpression) throw new Error('Missing leaderboard gap computation');
const renderGap = new Function('me', 't', 'pointsCopy', 'pointsRankingAvailable', 'fmt', 'formatComputePoints', 'locale', `return (${gapExpression});`);
const noteExpression = source.split('\n').find((line: string) => line.includes(':style="footerNoteStyle"'))?.match(/\{\{ (.*?) \}\}/)?.[1];
if (!noteExpression) throw new Error('Missing leaderboard ranking note');
const renderNote = new Function('period', 'pointsCopy', `return (${noteExpression});`);

describe('leaderboard point rank explanations', () => {
  for (const [locale, dictionary] of Object.entries({en, zh, vi})) {
    const copy = leaderboardPointsCopy(locale);
    const gap = (rank: number | null, points: number | null, available = true) => renderGap(
      {value:{rank, gapToNextComputePoints:points, gapToNext:9876}}, {value:dictionary}, {value:copy}, {value:available}, fmt, formatComputePoints, {code:locale});
    for (const period of ['today', 'week', 'month', 'all']) it(`${locale}/${period} describes the point ordering without payout promises`, () => {
      const note = renderNote(period, copy);
      expect(note).toBe(period === 'all' ? copy.noteAll : copy.note);
      expect(note).not.toMatch(/USDT|USD|\$|commission|pays out/);
    });
    it(`${locale} distinguishes first, unranked, tied, missing and unavailable`, () => {
      expect(gap(1, 0)).toBe(dictionary.leaderboard.myRank.first);
      expect(gap(null, null)).toBe(dictionary.leaderboard.myRank.notRanked);
      expect(gap(2, 0)).toContain(formatComputePoints(0, locale));
      expect(gap(2, 45)).toContain(formatComputePoints(45, locale));
      expect(gap(2, null)).toBe('—');expect(gap(2, 45, false)).toBe('—');
      expect(gap(2, 45)).not.toMatch(/9876|USDT|USD|\$/);
    });
  }
  it('falls back to English outside the three translated languages', () => {
    for (const locale of ['ja','ko','es','fr','de','pt','id','th']) expect(leaderboardPointsCopy(locale)).toBe(leaderboardPointsCopy('en'));
    expect(leaderboardPointsCopy('vi-VN')).toBe(leaderboardPointsCopy('vi'));
  });
});
