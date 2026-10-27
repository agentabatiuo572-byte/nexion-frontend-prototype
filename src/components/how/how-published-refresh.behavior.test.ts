import * as Vue from "vue";
import { compileScript, parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { afterEach, expect, it } from "vitest";
import genericSource from "./how-published-content.vue?raw";
import teamSource from "../team/reward-published-guide.vue?raw";
import { PublishedContentRequestFence } from "./p3-14-published-request-fence";
import { ApiError } from "@/api/errors";
import { en } from "@/i18n/messages/en";
import type { HowContentDocument } from "@/api/how-content-api";

type Node = { tag: string; text: string; props: Record<string, any>; children: Node[]; parent: Node | null };
const node = (tag = "") : Node => ({tag, text:"", props:{}, children:[], parent:null});
const renderer = Vue.createRenderer<Node, Node>({createElement:node,createText: text => ({...node(),text}),createComment:()=>node(),
  setText(n,t){n.text=t},setElementText(n,t){n.text=t},patchProp(n,k,old,v){n.props[k]=v},parentNode:n=>n.parent,nextSibling:()=>null,
  insert(n,p,anchor){n.parent=p;const i=anchor?p.children.indexOf(anchor):-1;if(i<0)p.children.push(n);else p.children.splice(i,0,n)},remove(n){if(n.parent)n.parent.children=n.parent.children.filter(c=>c!==n)}});
const stops: Array<()=>void> = [];afterEach(()=>stops.splice(0).forEach(stop=>stop()));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Vue.nextTick(); };
const doc = (key="genesis-how", body="Published complete guide") => ({ contentKey:key,locale:"en",blocks:[{id:"direct-referral-scope",title:"Published title",body,kind:"text"}] }) as HowContentDocument;
function mount(raw: string,key: string) {
  const locale=Vue.reactive({code:"vi"}),props=Vue.reactive({contentKey:key,back:"/pages/genesis/genesis",kind:"members",backLabel:"Back"});
  const requests: Array<{key:string;locale:string;resolve:(d:HowContentDocument)=>void;reject:(e:unknown)=>void}> = [];
  let unavailable=0,heroes=0;
  const hero=Vue.defineComponent({props:["title","sub"],setup:p=>{heroes++;return()=>Vue.h("hero",String(p.title)+String(p.sub))}});
  const wrapper=Vue.defineComponent({setup:(_,ctx)=>()=>Vue.h("section",ctx.slots.default?.())});
  const imports:Record<string,unknown>={vue:Vue,"@/api/errors":{ApiError},"@/api/runtime":{remoteApiEnabled:true,howContentApi:{published:(key:string,locale:string)=>new Promise<HowContentDocument>((resolve,reject)=>requests.push({key,locale,resolve,reject}))}},"@/store/locale":{useLocaleStore:()=>locale},"@/i18n/use-t":{useT:()=>Vue.ref(en)},"@/lib/route":{navBack:()=>{}},"./p3-14-published-request-fence":{PublishedContentRequestFence},"@/components/how/p3-14-published-request-fence":{PublishedContentRequestFence}};
  const code=ts.transpileModule(compileScript(parse(raw).descriptor,{id:"how-refresh",inlineTemplate:true,templateOptions:{compilerOptions:{isCustomElement:t=>["view","text"].includes(t)}}}).content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={} as {default:Vue.Component};new Function("require","exports",code)((id:string)=>imports[id]??{default:id.includes("hero")?hero:wrapper},exports);
  const root=node(),app=renderer.createApp({setup:()=>()=>Vue.h(exports.default,{...props,onUnavailable:()=>unavailable++})});app.mount(root);stops.push(()=>app.unmount());
  const all=():Node[]=>{const walk=(n:Node):Node[]=>[n,...n.children.flatMap(walk)];return walk(root)};
  return{locale,props,requests,app,unavailable:()=>unavailable,heroes:()=>heroes,text:()=>all().map(n=>n.text).join(" "),alert:()=>all().some(n=>n.props.role==="alert"),retry:()=>{const text=(n:Node):string=>n.text+n.children.map(text).join("");const retry=all().find(n=>n.props.role==="button"&&n.props.onClick&&text(n).includes(en.ui.retry));expect(retry).toBeTruthy();retry!.props.onClick();}};
}
for(const [name,raw,key] of [["ordinary",genericSource,"genesis-how"],["team",teamSource,"team-unilevel-how"]] as const){
  it(`${name}: retains same-scope complete/fallback body and hero instance while retry is pending`,async()=>{const w=mount(raw,key);w.requests[0].resolve(doc(key));await flush();expect(w.text()).toContain("Published complete guide");const heroes=w.heroes();w.retry();await flush();expect(w.requests).toHaveLength(2);expect(w.text()).toContain("Published complete guide");expect(w.heroes()).toBe(heroes);w.retry();await flush();expect(w.requests).toHaveLength(2);w.requests[1].resolve(doc(key,"Updated complete guide"));await flush();expect(w.text()).toContain("Updated complete guide");expect(w.heroes()).toBe(heroes);});
  it(`${name}: warm network failure retains body, reports unavailable and exposes retry`,async()=>{const w=mount(raw,key);w.requests[0].resolve(doc(key));await flush();w.retry();w.requests[1].reject(new ApiError({kind:"network",message:"REQUEST_TIMEOUT"}));await flush();expect(w.text()).toContain("Published complete guide");expect(w.text().indexOf("Published complete guide")).toBeLessThan(w.text().indexOf(en.howPublished.unavailableTitle));expect(w.alert()).toBe(true);expect(w.unavailable()).toBe(1);w.retry();await flush();expect(w.requests).toHaveLength(3);w.requests[2].resolve(doc(key,"Recovered guide"));await flush();expect(w.alert()).toBe(false);expect(w.text()).toContain("Recovered guide");});
  it(`${name}: cold network failure is a visible retryable unavailable state`,async()=>{const w=mount(raw,key);w.requests[0].reject(new ApiError({kind:"network",message:"NETWORK_UNAVAILABLE"}));await flush();expect(w.alert()).toBe(true);expect(w.text()).not.toContain("Published complete guide");expect(w.unavailable()).toBe(1);w.retry();expect(w.requests).toHaveLength(2);});
  it(`${name}: scope change clears synchronously and rejects prior response/failure`,async()=>{const w=mount(raw,key);w.requests[0].resolve(doc(key));await flush();w.retry();w.locale.code="zh";await Vue.nextTick();expect(w.text()).not.toContain("Published complete guide");expect(w.requests.at(-1)?.locale).toBe("zh");w.requests[1].reject(new ApiError({kind:"network",message:"OLD"}));await flush();expect(w.unavailable()).toBe(0);w.requests[2].resolve(doc(key,"Chinese scope"));await flush();w.props.contentKey="wallet-repurchase-how";await Vue.nextTick();expect(w.text()).not.toContain("Chinese scope");w.requests.at(-1)!.resolve(doc("wallet-repurchase-how","New key"));await flush();expect(w.text()).toContain("New key");});
  it.each([new ApiError({kind:"business",message:"TEAM_PUBLICATION_REQUIRED"}),new ApiError({kind:"http",message:"NOT_FOUND",status:404}),new ApiError({kind:"protocol",message:"HOW_CONTENT_RESPONSE_INVALID"})])(`${name}: explicit rejection invalidates old published body (%s)`,async error=>{const w=mount(raw,key);w.requests[0].resolve(doc(key));await flush();w.retry();w.requests[1].reject(error);await flush();expect(w.text()).not.toContain("Published complete guide");expect(w.alert()).toBe(true);expect(w.unavailable()).toBe(1);});
  it(`${name}: unresolved public value invalidates even an already readable snapshot`,async()=>{const w=mount(raw,key);w.requests[0].resolve(doc(key));await flush();w.retry();w.requests[1].resolve(doc(key,"Fee {value}"));await flush();expect(w.text()).not.toContain("Published complete guide");expect(w.text()).not.toContain("{value}");expect(w.alert()).toBe(true);expect(w.unavailable()).toBe(1);});
}

it("clears a prior team publication when the refreshed v2 schema lacks its required scope",async()=>{const w=mount(teamSource,"team-unilevel-how");w.requests[0].resolve(doc("team-unilevel-how"));await flush();w.retry();w.requests[1].resolve({...doc("team-unilevel-how"),schemaVersion:2,templateId:"unilevel-v2"});await flush();expect(w.text()).not.toContain("Published complete guide");expect(w.alert()).toBe(true);expect(w.unavailable()).toBe(1);});
it.each([["ordinary",genericSource],["team",teamSource]] as const)("%s unmount invalidates late network failure without emitting unavailable",async(_,raw)=>{const w=mount(raw,"genesis-how");w.app.unmount();w.requests[0].reject(new ApiError({kind:"network",message:"LATE"}));await flush();expect(w.unavailable()).toBe(0);});
