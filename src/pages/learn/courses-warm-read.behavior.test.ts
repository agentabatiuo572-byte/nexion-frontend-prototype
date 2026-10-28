import * as Vue from 'vue';
import ts from 'typescript';
import {expect,it,vi} from 'vitest';
import source from './courses.vue?raw';
import {createLearningPageFenceReader} from './learning-page-fence';
import * as visibility from '@/lib/page-visibility-refresh';
import {ApiError} from '@/api/errors';
import {captureRuntimeRevision} from '@/api/order-api';
function setup(){
 const app=Vue.reactive({accountKey:'A',accountBindingEpoch:1}),locale=Vue.reactive({code:'en'}),environment=Vue.reactive({environment:'prod'});
 const api={courses:vi.fn()},hooks:Record<string,Array<()=>void>>={mounted:[],show:[],hide:[],unmount:[]};
 const modules:Record<string,any>={vue:{...Vue,onMounted:(fn:()=>void)=>hooks.mounted.push(fn),onUnmounted:(fn:()=>void)=>hooks.unmount.push(fn)},
 '@dcloudio/uni-app':{onShow:(fn:()=>void)=>hooks.show.push(fn),onHide:(fn:()=>void)=>hooks.hide.push(fn)},
 '@/api/learning-runtime':{learningApi:api},'@/api/runtime':{remoteApiEnabled:true,apiRuntimeConfig:environment},
 '@/lib/route':{},'@/i18n/audit-ui':{useAuditUiCopy:()=>Vue.ref({})},'@/i18n/format':{},'@/lib/amount-display':{},
 '@/lib/course-duration':{},'@/i18n/learning-recommendation':{},'@/lib/learning-recommendation':{},
 '@/i18n/use-t':{useT:()=>Vue.ref({})},'@/store/locale':{useLocaleStore:()=>locale},'@/store/app':{useApp:()=>app},
 '@/api/order-api':{captureRuntimeRevision,subscribeRuntimeRevision:()=>()=>{}},'./learning-page-fence':{createLearningPageFenceReader},
 '@/lib/page-visibility-refresh':visibility};
 const script=source.split('<script setup lang="ts">')[1].split('</script>')[0];
 const js=ts.transpileModule(script,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const scope=Vue.effectScope();
 const page=scope.run(()=>new Function('require','exports',js+';mounted=true;return {load,overview,loading,error};')((id:string)=>id.endsWith('.vue')?{}:modules[id],{}));
 return {app,locale,environment,api,page,stop:()=>scope.stop()};
}
const facts=(name='Confirmed')=>({courses:[{id:name,title:name}],totalCourses:1,completedCourses:0,earnedNex:0});
it('keeps confirmed course listings through warm reads and clears on actual errors',async()=>{
 const p=setup();p.api.courses.mockResolvedValue(facts());await p.page.load();
 let finish!:(value:any)=>void;p.api.courses.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 const warm=p.page.load();expect(p.page.overview.value.courses[0].title).toBe('Confirmed');
 expect(p.page.loading.value).toBe(true);finish(facts('Updated'));await warm;
 expect(p.page.overview.value.courses[0].title).toBe('Updated');
 p.api.courses.mockRejectedValueOnce(new ApiError({kind:'http',status:403,code:403,message:'FORBIDDEN'}));
 await p.page.load();expect(p.page.overview.value).toBeNull();expect(p.page.error.value).toBe('centerUnavailable');p.stop();
});
it.each(['account','binding','language','environment'])('clears synchronously and rejects old success through %s A-B-A',async change=>{
 const p=setup();p.api.courses.mockResolvedValue(facts());await p.page.load();
 let finish!:(value:any)=>void;p.api.courses.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));const old=p.page.load();
 p.api.courses.mockImplementation(()=>new Promise(()=>{}));
 if(change==='account'){p.app.accountKey='B';p.app.accountKey='A';}
 if(change==='binding'){p.app.accountBindingEpoch++;p.app.accountBindingEpoch++;}
 if(change==='language'){p.locale.code='vi';p.locale.code='en';}
 if(change==='environment'){p.environment.environment='dev';p.environment.environment='prod';}
 expect(p.page.overview.value).toBeNull();finish(facts('Old'));await old;
 expect(p.page.overview.value).toBeNull();p.stop();
});
it('never lets an older same-scope success overwrite the later read',async()=>{
 const p=setup();let finish!:(value:any)=>void;p.api.courses.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 const old=p.page.load();p.api.courses.mockResolvedValue(facts('Newest'));await p.page.load();finish(facts('Old'));await old;
 expect(p.page.overview.value.courses[0].title).toBe('Newest');p.stop();
});
