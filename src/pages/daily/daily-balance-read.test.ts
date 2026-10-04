// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./daily.vue', import.meta.url), 'utf8');
const expression = source.match(/statValStyle\('var\(--v5-success\)'\)[^>]*>\{\{\s*(.*?)\s*\}\}/)?.[1];
if (!expression) throw new Error('Daily balance template binding not found');
const renderBalance = new Function('remoteApiEnabled', 'app', `return (${expression});`);

describe('Daily canonical balance visibility', () => {
  it('does not display the local zero placeholder before a remote wallet snapshot', () => {
    expect(renderBalance(true, { remoteFleetHasSnapshot: false, user: { nexBalance: 0 } })).toBe('—');
  });
  it('shows a confirmed zero and a confirmed positive balance', () => {
    for (const nexBalance of [0, 197]) {
      expect(renderBalance(true, { remoteFleetHasSnapshot: true, user: { nexBalance } })).toBe(nexBalance);
    }
  });
  it('keeps local mode readable without a remote snapshot', () => {
    expect(renderBalance(false, { remoteFleetHasSnapshot: false, user: { nexBalance: 12 } })).toBe(12);
  });
});
