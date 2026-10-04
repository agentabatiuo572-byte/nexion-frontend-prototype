// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fmt } from '@/i18n/format';

const source = readFileSync(new URL('./leaderboard.vue', import.meta.url), 'utf8');
const gapExpression = source.match(/const gapText = computed\(\(\) => ([\s\S]*?)\);/)?.[1];
if (!gapExpression) throw new Error('Missing leaderboard gap computation');
const renderGap = new Function('me', 't', 'fmt', `return (${gapExpression});`);
const noteExpression = source.split('\n').find((line: string) => line.includes(':style="footerNoteStyle"'))?.match(/\{\{ (.*?) \}\}/)?.[1];
if (!noteExpression) throw new Error('Missing leaderboard settlement note');
const renderNote = new Function('period', 't', `return (${noteExpression});`);
const t = { value: { leaderboard: { myRank: { notRanked: 'Not ranked', first: 'Currently first', gap: 'Gap to preceding rank: ${amount}' } } } };
describe('leaderboard rank explanations', () => {
  for (const period of ['today', 'week', 'month', 'all']) {
    it(`${period} uses the matching settlement explanation`, () => {
      expect(renderNote(period, { leaderboard: { note: 'Periodic settlement', noteAllTime: 'All-time settlement' } }))
        .toBe(period === 'all' ? 'All-time settlement' : 'Periodic settlement');
    });
  }
  it('does not tell the leader to earn more to advance', () => {
    expect(renderGap({ value: { rank: 1, gapToNext: 0 } }, t, fmt)).toBe('Currently first');
  });
  it('keeps unranked state distinct from first place', () => {
    expect(renderGap({ value: { rank: null, gapToNext: 0 } }, t, fmt)).toBe('Not ranked');
  });
  it('can display a zero earnings gap for a tied lower rank', () => {
    expect(renderGap({ value: { rank: 2, gapToNext: 0 } }, t, fmt)).toBe('Gap to preceding rank: $0');
  });
});
