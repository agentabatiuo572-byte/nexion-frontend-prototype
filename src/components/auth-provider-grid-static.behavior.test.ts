import {expect,it,vi} from 'vitest';
import * as Vue from 'vue';
import {all,mountEntry,text} from '@/lib/entry-review.test-support';
import {en} from '@/i18n/messages/en';
import {fmt} from '@/i18n/format';
import source from './auth-provider-grid.vue?raw';
it('retains fixed provider names and artwork when externally disabled while the actual activation stays blocked',()=>{
 const activate=vi.fn();const page=mountEntry(source,{'@/i18n/format':{fmt},'@/i18n/use-t':{useT:()=>Vue.ref(en)}},{busy:true,preserveAppearance:true,onSelect:activate});
 expect(page.nodes('auth-provider-grid')[0].props.class).toContain('auth-provider-grid--stable');
 for(const name of ['Passkey','Google','Apple','Telegram']){
   expect(text(page.root)).toContain(name);const node=all(page.root).find(n=>n.props['data-provider']===name)!;
   expect(node.props['aria-disabled']).toBe(true);node.props.onClick();
 }
 expect(activate).not.toHaveBeenCalled();page.unmount();
});
