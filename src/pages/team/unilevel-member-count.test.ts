// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./unilevel.vue', import.meta.url), 'utf8');
describe('unilevel member counts require a confirmed network', () => {
  for (const filter of ['all', 'direct', 'extended']) {
    const line = source.split('\n').find((value: string) => value.includes(`value: "${filter}"`));
    const expression = line?.match(/count: (.+?), className:/)?.[1];
    if (!expression) throw new Error(`Missing ${filter} count`);
    const render = new Function('remoteApiEnabled', 'network', 'directMembers', 'extendedMembers', `return (${expression.replace(/directMembers\.value/g, 'directMembers').replace(/extendedMembers\.value/g, 'extendedMembers')});`);
    it(`${filter}: unknown is not zero, confirmed zero remains zero`, () => {
      for (const remoteStatus of ['idle', 'loading', 'error']) {
        expect(render(true, { remoteStatus }, [], [])).toBe('—');
      }
      expect(render(true, { remoteStatus: 'ready' }, [], [])).toBe(0);
      expect(render(true, { remoteStatus: 'ready' }, [1, 2, 3], [4, 5])).toBe(filter === 'all' ? 5 : filter === 'direct' ? 3 : 2);
      expect(render(false, { remoteStatus: 'idle' }, [1, 2, 3], [4, 5])).toBe(filter === 'all' ? 5 : filter === 'direct' ? 3 : 2);
    });
  }
});
