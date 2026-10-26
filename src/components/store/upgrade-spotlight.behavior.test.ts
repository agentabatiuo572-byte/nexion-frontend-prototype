import * as Vue from 'vue';
import { compileScript, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { afterEach, expect, it, vi } from 'vitest';
import source from './upgrade-spotlight.vue?raw';

const code=ts.transpileModule(compileScript(parse(source).descriptor,{id:'upgrade-images'}).content,
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const cleanups:Array<()=>void>=[];
afterEach(()=>cleanups.splice(0).forEach(fn=>fn()));
function mount(){
  const app=Vue.reactive({accountKey:'user:7',accountBindingEpoch:1});
  const catalog=Vue.reactive({status:'ready',revision:'1'});
  const props=Vue.reactive<{base:{kind:string;name:string;baseRate:number};baseImageUrl?:string;target:{id:string;name:string;dailyEarn:number;imageUrl?:string}}>({
    base:{kind:'phone',name:'Current device',baseRate:1},
    target:{id:'sku-target',name:'Target device',dailyEarn:2,imageUrl:'https://images.example/target'},
  });
  const navTo=vi.fn(),modules:Record<string,unknown>={vue:Vue,
    '@/components/catalog-machine-image.vue':{default:{}},'@/components/ui/nx-button.vue':{default:{}},
    '@/store/app':{useApp:()=>app},'@/store/product-catalog':{productCatalogState:catalog},
    '@/i18n/audit-ui':{useAuditUiCopy:()=>({upgrade:'Upgrade',details:'Details'})},
    '@/i18n/use-t':{useT:()=>Vue.ref({store:{}})},'@/store/locale':{useLocaleStore:()=>({code:'zh'})},
    '@/i18n/format':{fmtMoney:String},'@/lib/brand-copy':{nexGridBrandText:(text:string)=>text},'@/lib/route':{navTo},
  };
  const exports:Record<string,any>={};
  new Function('require','exports',code)((id:string)=>{if(!(id in modules))throw new Error(id);return modules[id];},exports);
  const scope=Vue.effectScope(),view=scope.run(()=>exports.default.setup(props,{expose(){}}))!;
  cleanups.push(()=>scope.stop());return{app,catalog,props,view,navTo};
}

it('uses provided catalog images for both sides and leaves a phone without an image neutral',()=>{
  const screen=mount();expect(screen.view.baseImageProps.value.imageUrl).toBeUndefined();
  expect(screen.view.targetImageProps.value.imageUrl).toBe(screen.props.target.imageUrl);
  screen.props.base.kind='owned-sku';screen.props.baseImageUrl='https://images.example/base';
  expect(screen.view.baseImageProps.value).toMatchObject({sku:'owned-sku',imageUrl:'https://images.example/base'});
  screen.props.baseImageUrl=undefined;expect(screen.view.baseImageProps.value.imageUrl).toBeUndefined();
  expect(source).not.toContain('phone.webp');
});

it.each(['base','target'] as const)('resets only the changed %s side and rejects its old ready callback',side=>{
  const screen=mount();screen.props.baseImageUrl='https://images.example/base';
  const oldBase=screen.view.baseImageProps.value,oldTarget=screen.view.targetImageProps.value;
  oldBase.onReady(true);oldTarget.onReady(true);
  if(side==='base'){screen.props.base.kind='next-base';screen.props.baseImageUrl='https://images.example/next-base';}
  else{screen.props.target.id='next-target';screen.props.target.imageUrl='https://images.example/next-target';}
  const changed=side==='base'?screen.view.baseReady:screen.view.targetReady;
  const unchanged=side==='base'?screen.view.targetReady:screen.view.baseReady;
  expect(changed.value).toBe(false);expect(unchanged.value).toBe(true);
  const old=side==='base'?oldBase:oldTarget;old.onReady(true);expect(changed.value).toBe(false);
  const current=side==='base'?screen.view.baseImageProps.value:screen.view.targetImageProps.value;
  current.onReady(true);old.onReady(false);expect(changed.value).toBe(true);
});

it('resets decode readiness when the target SKU changes while its URL stays the same',()=>{
  const screen=mount(),old=screen.view.targetImageProps.value;old.onReady(true);
  screen.props.target.id='other-sku';expect(screen.view.targetReady.value).toBe(false);
  old.onReady(true);expect(screen.view.targetReady.value).toBe(false);
  expect(screen.view.targetImageProps.value.imageUrl).toBe(old.imageUrl);
});

it.each(['account','epoch','catalog'] as const)('isolates both sides across the %s boundary and permits same-URL recovery',boundary=>{
  const screen=mount();screen.props.baseImageUrl='https://images.example/base';
  const oldBase=screen.view.baseImageProps.value,oldTarget=screen.view.targetImageProps.value;
  oldBase.onReady(true);oldTarget.onReady(true);
  if(boundary==='account')screen.app.accountKey='user:8';
  if(boundary==='epoch')screen.app.accountBindingEpoch++;
  if(boundary==='catalog')screen.catalog.status='error';
  expect(screen.view.baseReady.value).toBe(false);expect(screen.view.targetReady.value).toBe(false);
  oldBase.onReady(true);oldTarget.onReady(true);
  expect(screen.view.baseReady.value).toBe(false);expect(screen.view.targetReady.value).toBe(false);
  if(boundary==='catalog'){
    expect(screen.view.baseImageProps.value.imageUrl).toBeUndefined();expect(screen.view.targetImageProps.value.imageUrl).toBeUndefined();
    screen.catalog.status='ready';
  }
  screen.view.baseImageProps.value.onReady(true);screen.view.targetImageProps.value.onReady(true);
  expect(screen.view.baseReady.value).toBe(true);expect(screen.view.targetReady.value).toBe(true);
});

it('opens the current target detail after the image binding changes',()=>{
  const screen=mount();screen.props.target.id='next target';screen.view.open();
  expect(screen.navTo).toHaveBeenCalledExactlyOnceWith('/pages/store/detail?id=next%20target');
});
