// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const taskCenter = readFileSync(new URL("./task-center.vue", import.meta.url), "utf8");
const receiptsPage = readFileSync(new URL("../../pages/me/receipts.vue", import.meta.url), "utf8");
const appStore = readFileSync(new URL("../../store/app.ts", import.meta.url), "utf8");

describe("earn history Proof-of-Compute interaction", () => {
  it("uses the same receipt document glyph as the high-fidelity page and no R placeholder", () => {
    expect(taskCenter).toContain('d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2');
    expect(taskCenter).not.toContain('font-weight: 600">R</text>');
  });

  it("opens a canonical receipt from the whole history row and the remote receipts list", () => {
    expect(taskCenter).toMatch(/@click\.stop="openTaskReceipt\(task\)"/);
    expect(taskCenter).toMatch(/taskAssignmentApi\.receipt\(task\.receiptNo\)/);
    expect(receiptsPage).toMatch(/@click\.stop="openRemoteComputeReceipt\(r\)"/);
    expect(receiptsPage).toMatch(/taskAssignmentApi\.receipt\(task\.receiptNo/);
  });

  it("loads the selected remote receipt category from its canonical paginated authority", () => {
    expect(receiptsPage).toMatch(/taskAssignmentApi\.receipts\(offset, 20, cursor\)/);
    expect(receiptsPage).toContain("remoteComputeReceiptNextOffset");
    expect(receiptsPage).toContain('remoteReceiptKind.value === "compute"');
    expect(receiptsPage).toContain("loadSelectedRemoteReceipts");
    expect(receiptsPage).toContain("loadSelectedMoreRemoteReceipts");
    expect(receiptsPage).not.toContain("Promise.allSettled(requests)");
    expect(receiptsPage).not.toContain("app.visibleDevices.flatMap");
  });

  it("keeps Proof-of-Compute and top-up receipts in separate tabs with a compute default", () => {
    expect(receiptsPage).toContain('type RemoteReceiptKind = "compute" | "deposit"');
    expect(receiptsPage).toContain('const remoteReceiptKind = ref<RemoteReceiptKind>("compute")');
    expect(receiptsPage).toContain('onLoad((options) =>');
    expect(receiptsPage).toContain('options?.kind === "deposit" ? "deposit" : "compute"');
    expect(receiptsPage).toContain('v-if="remoteReceiptKind === \'compute\'"');
    expect(receiptsPage).toContain('v-if="remoteReceiptKind === \'deposit\'"');
  });

  it("invalidates receipt requests on every account binding and supports keyboard pagination", () => {
    expect(appStore).toContain("const accountBindingEpoch = ref(remoteAccountEpoch.snapshot().epoch)");
    expect(appStore).toContain("accountBindingEpoch.value = remoteAccountEpoch.snapshot().epoch");
    expect(appStore).toMatch(/return \{\s*accountKey, accountBindingEpoch,/);
    expect(taskCenter).toContain("app.accountBindingEpoch");
    expect(receiptsPage).toContain("expectedBindingEpoch !== app.accountBindingEpoch");
    expect(receiptsPage).toMatch(/watch\(\s*\(\) => \[app\.accountKey, app\.accountBindingEpoch\]/);
    expect(receiptsPage).toContain('@keydown.enter.stop.prevent="loadSelectedMoreRemoteReceipts"');
    expect(receiptsPage).toContain('@keydown.space.stop.prevent="loadSelectedMoreRemoteReceipts"');
  });

  it("uses the same 8 GB routing capacity as the server for Cloud Share", () => {
    expect(taskCenter).toContain("const CLOUD_SHARE_ROUTING_VRAM_GB = 8");
    expect(taskCenter).toMatch(/d\.kind === "cloud-share" \? CLOUD_SHARE_ROUTING_VRAM_GB : d\.vramTotal/);
  });
});

import * as Vue from 'vue';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';
import ts from 'typescript';
import { createPinia, setActivePinia } from 'pinia';
import { zh } from '@/i18n/messages/zh';
import { fmt } from '@/i18n/format';
import { taskRelativeTime } from '@/lib/task-relative-time';
import { workloadLabel } from '@/lib/workload-label';
import { isActiveSlotDevice } from '@/lib/device-slot-policy';
const remote = vi.hoisted(() => ({
  remoteApiEnabled: true, fundsServerEnabled: true, expectedApiEnvironment: 'dev',
  sessionVault: { read: vi.fn() }, deviceE3Api: { fleet: vi.fn() },
  taskAssignmentApi: { state: vi.fn(), receipt: vi.fn() }, appHomeApi: { fetch: vi.fn() },
  withdrawalApi: { submit: vi.fn(), list: vi.fn(), get: vi.fn() },
}));
vi.mock('@/api/runtime', () => remote);
const { useApp } = await import('@/store/app');
const { useUI, toast } = await import('@/store/ui');
const sourceRoot = new URL("../../", import.meta.url);
const stopped: Array<() => void> = [];
function deferred<T>() { let resolve!: (v:T)=>void; let reject!:(e:unknown)=>void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
async function flush() { for(let i=0;i<8;i++) await Promise.resolve(); await Vue.nextTick(); }
beforeEach(() => {
  setActivePinia(createPinia()); Object.values(remote).forEach(v=>{ if(v&&typeof v==='object') Object.values(v).forEach(m=>{ if(typeof (m as any)?.mockReset==='function') (m as any).mockReset(); }); });
  remote.sessionVault.read.mockReturnValue(null); // bindAccount cannot dispatch even an incidental withdrawal read.
  vi.stubGlobal('fetch', () => { throw new Error('NETWORK_FORBIDDEN'); }); vi.useFakeTimers();
});
afterEach(() => { stopped.splice(0).forEach(stop=>stop()); vi.useRealTimers(); vi.unstubAllGlobals(); });
function compile(path:string, imports:(id:string)=>any, template=false) {
  const {descriptor}=parse(readFileSync(new URL(path, sourceRoot),'utf8'), {filename:path});
  const script=compileScript(descriptor,{id:'earn-finite-'+path});
  const js=ts.transpileModule(script.content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
  const module={exports:{} as any}; new Function('require','module','exports',js)(imports,module,module.exports);
  const component=module.exports.default;
  if(template) {
    const render=compileTemplate({source:descriptor.template!.content,filename:path,id:'earn-finite',compilerOptions:{bindingMetadata:script.bindings,isCustomElement:tag=>['view','text'].includes(tag)}});
    if(render.errors.length) throw new Error(JSON.stringify(render.errors));
    const code=ts.transpileModule(render.code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
    const r={exports:{} as any}; new Function('require','module','exports',code)(imports,r,r.exports); component.render=r.exports.render;
  }
  return component;
}
async function setup() {
  const app=useApp(); app.bindAccount('A'); const ui=useUI(); const shows:Function[]=[]; const hides:Function[]=[];
  const modal={props:['receipt'],emits:['close'],setup:(p:any,c:any)=>()=>Vue.h('probe-modal',{receipt:p.receipt,onClose:()=>c.emit('close')})};
  const noChild={render:()=>null}; const navigation={navTo:vi.fn()};
  const imports=(id:string):any=>{
    if(id==='vue')return Vue;
    if(id==='@dcloudio/uni-app')return{onShow:(f:Function)=>shows.push(f),onHide:(f:Function)=>hides.push(f)};
    if(id==='@/store/app')return{useApp:()=>app};
    if(id==='@/store/ui')return{toast};
    if(id==='@/i18n/use-t')return{useT:()=>Vue.ref(zh)};
    if(id==='@/i18n/format')return{fmt};
    if(id==='@/lib/task-relative-time')return{taskRelativeTime};
    if(id==='@/lib/workload-label')return{workloadLabel};
    if(id==='@/lib/device-slot-policy')return{isActiveSlotDevice};
    if(id==='@/lib/route')return navigation;
    if(id==='@/api/runtime')return remote;
    if(id==='@/store/receipts')return{useReceipts:()=>{throw new Error('MOCK_RECEIPTS_FORBIDDEN');}};
    if(id==='@/store/earn-config')return{prepareEarnConfig:()=>{},useEarnConfig:()=>({lockedTeasers:()=>[],refreshRoute:()=>Promise.resolve()})};
    if(id==='@/store/free-trial')return{useFreeTrial:()=>({refreshRemote:()=>Promise.resolve()})};
    if(id==='@/composables/use-capacity-explainer')return{useCapacityExplainer:()=>({open:vi.fn()})};
    if(id==='@/lib/account-scope')return{captureAccountScope:()=>({accountKey:app.accountKey,bindingEpoch:app.accountBindingEpoch}),isCurrentAccountScope:()=>true};
    if(id==='@/lib/authenticated-page-observation')return{authenticatedPageObservationReporter:{report:()=>{throw new Error('OBSERVATION_FORBIDDEN');}}};
    if(id==='@/components/me/receipt-modal.vue')return{__esModule:true,default:modal};
    if(id.endsWith('.vue'))return{__esModule:true,default:noChild};
    throw new Error('UNEXPECTED_IMPORT '+id);
  };
  const task=compile('components/earn/task-center.vue',imports,true); const parent=compile('pages/earn/earn.vue',imports);
  const renderer=Vue.createRenderer<any,any>({
    insert:(child,p,anchor)=>{child.parent=p;p.children??=[]; const at=anchor?p.children.indexOf(anchor):-1;if(at<0)p.children.push(child);else p.children.splice(at,0,child);},
    remove:n=>{if(n.parent)n.parent.children=n.parent.children.filter((x:any)=>x!==n);},
    createElement:tag=>({tag,props:{},children:[]}),createText:text=>({text,children:[]}),createComment:text=>({comment:text,children:[]}),setText:(n,text)=>{n.text=text;},setElementText:(n,text)=>{n.text=text;},parentNode:n=>n.parent??null,nextSibling:()=>null,patchProp:(n,k,_o,v)=>{n.props[k]=v;},
  });
  let taskState:any; const child={...task,setup:(p:any,c:any)=>{taskState=task.setup(p,c);return taskState;}};
  const root:any={children:[]}; const mounted=renderer.createApp({...parent,render:()=>Vue.h(child)}); mounted.mount(root);
  let active=true; const stop=()=>{if(active){active=false;mounted.unmount();}}; stopped.push(stop); await flush();
  const find=(tag:string):any=>{const walk=(n:any):any=>n.tag===tag?n:(n.children??[]).map(walk).find(Boolean);return walk(root);};
  return {app,ui,task:taskState,root,stop,find,hide:()=>hides.forEach(f=>f()),show:()=>shows.forEach(f=>f()),rebind:(key:string)=>app.bindAccount(key)};
}
const row={id:'task-synthetic',receiptNo:'receipt-synthetic'} as any;
const receipt={receiptNo:'receipt-synthetic',serverCanonical:true} as any;
describe('actual Earn/TaskCenter mounted handlers with production App/UI stores',()=>{
  it('current success opens only the selected receipt',async()=>{
    const s=await setup();remote.taskAssignmentApi.receipt.mockResolvedValue(receipt);await s.task.openTaskReceipt(row);await flush();expect(s.find('probe-modal').props.receipt).toEqual(receipt);expect(s.ui.toasts).toHaveLength(0);
  });
  it.each(['account','same-account-rebind','unmount'])('late rejection remains fenced after %s',async boundary=>{
    const s=await setup();const r=deferred<any>();remote.taskAssignmentApi.receipt.mockReturnValue(r.promise);const pending=s.task.openTaskReceipt(row);
    if(boundary==='account')s.rebind('B');if(boundary==='same-account-rebind')s.rebind('A');if(boundary==='unmount')s.stop();await flush();r.reject(new Error('CONTROLLED_RECEIPT_FAIL'));await pending;expect(s.ui.toasts).toHaveLength(0);
  });
  it('page hide suppresses a late rejection while the Earn tab remains mounted',async()=>{
    const s=await setup();const r=deferred<any>();remote.taskAssignmentApi.receipt.mockReturnValue(r.promise);const pending=s.task.openTaskReceipt(row);s.hide();r.reject(new Error('CONTROLLED_RECEIPT_FAIL'));await pending;await flush();
    console.log(JSON.stringify({branch:'hide-late-reject',account:s.app.accountKey,bindingEpoch:s.app.accountBindingEpoch,toasts:s.ui.toasts.map(t=>({kind:t.kind,title:t.title})),receipt:s.find('probe-modal').props.receipt}));expect(s.ui.toasts).toHaveLength(0);
  });
  it('current visible rejection remains an error',async()=>{
    const s=await setup();remote.taskAssignmentApi.receipt.mockRejectedValue(new Error('CONTROLLED_RECEIPT_FAIL'));await s.task.openTaskReceipt(row);
    expect(s.ui.toasts).toHaveLength(1);expect(s.ui.toasts[0]?.kind).toBe('error');
  });
  it('hide then show does not restore a prior pending error',async()=>{
    const s=await setup();const r=deferred<any>();remote.taskAssignmentApi.receipt.mockReturnValue(r.promise);const pending=s.task.openTaskReceipt(row);s.hide();s.show();r.reject(new Error('CONTROLLED_RECEIPT_FAIL'));await pending;
    expect(s.ui.toasts).toHaveLength(0);expect(s.find('probe-modal').props.receipt).toBeNull();
  });
  it.each(['success','failure'])('a fresh visible request after hide/show handles %s normally',async outcome=>{
    const s=await setup();s.hide();s.show();
    if(outcome==='success')remote.taskAssignmentApi.receipt.mockResolvedValue(receipt);else remote.taskAssignmentApi.receipt.mockRejectedValue(new Error('CONTROLLED_RECEIPT_FAIL'));
    await s.task.openTaskReceipt(row);await flush();
    expect(s.ui.toasts).toHaveLength(outcome==='success'?0:1);expect(s.find('probe-modal').props.receipt).toEqual(outcome==='success'?receipt:null);
  });
});
