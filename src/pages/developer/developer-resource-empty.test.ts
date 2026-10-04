// @ts-expect-error Node is used only by the test runner.
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
const source=readFileSync(new URL('./developer.vue',import.meta.url),'utf8');
for (const [list,label] of [['apiKeys','keysEmpty'],['webhooks','webhooksEmpty']]) {
  const tag=source.split('\n').find((line:string)=>line.includes(`t.developer.${label}`));
  const condition=tag?.match(/v-if="([^"]+)"/)?.[1];
  if(!condition) throw new Error(`Missing ${label} empty-state condition`);
  const visible=new Function(list,'resourcesLoading','resourcesLoadFailed','resourcesReady',`return (${condition});`);
  describe(`${list} authoritative empty state`,()=>{
    it('does not claim empty before a successful read or after failure',()=>{
      expect(visible([],false,false,false)).toBe(false);
      expect(visible([],false,true,false)).toBe(false);
    });
    it('shows only a confirmed empty result',()=>{
      expect(visible([],false,false,true)).toBe(true);
      expect(visible([{}],false,false,true)).toBe(false);
      expect(visible([],true,false,false)).toBe(false);
    });
  });
}
