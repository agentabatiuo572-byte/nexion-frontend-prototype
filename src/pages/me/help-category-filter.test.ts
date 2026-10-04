// @ts-expect-error Node is used only by the test runner.
import { readFileSync } from 'node:fs';
import { computed, ref } from 'vue';
import { describe, expect, it } from 'vitest';
const source = readFileSync(new URL('./help.vue', import.meta.url), 'utf8');
const start = source.indexOf('const filtered = computed(');
const end = source.indexOf('const emptyResults', start);
const code = source.slice(start, end) + '; return filtered;';
describe('Help Center categories from PC M4', () => {
  it('preserves search, legacy topics, and all-category visibility', () => {
    const faqs = ref([
      {id:'1',category:' WITHDRAWAL ',question:'withdraw',answer:'daily limit'},
      {id:'2',category:'payments',question:'legacy',answer:'legacy answer'},
      {id:'3',category:'hardware',question:'device',answer:'help'},
      {id:'4',category:'future-category',question:'future',answer:'help'},
    ]);
    const query = ref(''); const cat = ref('payments');
    const result = new Function('computed','faqs','query','cat','requestedFaqId',code)(computed,faqs,query,cat,ref(''));
    expect(result.value.map((row: {id:string}) => row.id)).toEqual(['1','2']);
    query.value='DAILY'; expect(result.value.map((row: {id:string}) => row.id)).toEqual(['1']);
    query.value='missing'; expect(result.value).toEqual([]);
    query.value='';cat.value='all';expect(result.value).toHaveLength(4);
  });
  for (const [category, group] of [['general','getting-started'],['account','getting-started'],['other','getting-started'],['withdrawal','payments'],['deposit','payments'],['hardware','devices'],['genesis','devices'],['earnings','earnings'],['technical','technical']]) {
    it(`${category} is visible in ${group}`, () => {
      const result = new Function('computed','faqs','query','cat','requestedFaqId',code)(computed,ref([{id:'1',category,question:'question',answer:'answer'}]),ref(''),ref(group),ref(''));
      expect(result.value).toHaveLength(1);
    });
  }
});
