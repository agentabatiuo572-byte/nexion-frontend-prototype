// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
const source = readFileSync(new URL('./help.vue', import.meta.url), 'utf8');
const line = source.split('\n').find((s:string) => s.includes('filtered.length === 0'));
const condition = line?.match(/v-else-if="([^"]+)"/)?.[1];
if (!condition) throw new Error('Missing FAQ empty condition');
const visible = new Function('filtered','faqPageNum','faqLoading','faqLoadError','canLoadMoreFaqs',`return (${condition});`);
describe('FAQ empty conclusion requires a complete successful read', () => {
  it('does not claim no match while pages remain or before first read', () => {
    expect(visible([],0,false,false,false)).toBe(false);
    expect(visible([],1,false,false,true)).toBe(false);
  });
  it('does not claim empty during loading or a failed refresh', () => {
    expect(visible([],1,true,false,false)).toBe(false);
    expect(visible([],1,false,true,false)).toBe(false);
  });
  it('preserves confirmed empty and nonempty results', () => {
    expect(visible([],1,false,false,false)).toBe(true);
    expect(visible([{}],1,false,false,false)).toBe(false);
  });
});
