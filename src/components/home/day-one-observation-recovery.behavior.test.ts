import { describe, expect, it, vi as mock } from "vitest";
import { compile } from "@vue/compiler-dom";
import * as Vue from "vue";
import ts from "typescript";
import source from "./day-one-quest-card.vue?raw";
import { createDayOneObservationRecovery, observationRecoveryRoute } from "@/lib/day-one-observation-recovery";
import { ApiError } from "@/api/errors";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
const block = source.slice(source.indexOf('    <view v-if="expanded && observationNotices.length"'), source.indexOf('    <text v-if="remoteApiEnabled && quest.dayOneClaimError"'));
const render = new Function("Vue", compile(block, {mode:"function",prefixIdentifiers:true,isCustomElement:()=>true}).code)(Vue);
const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
const ast = ts.createSourceFile("card.ts",script,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const handlerSource = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text==="recoverObservation")!.getText(ast);
function handler(deps: Record<string, unknown>, web: boolean) {
  const code = web ? handlerSource : handlerSource.replace(/\/\/ #ifdef H5[\s\S]*?\/\/ #endif/,"");
  return new Function(...Object.keys(deps),ts.transpile(code,{target:ts.ScriptTarget.ES2022})+";return recoverObservation;")(...Object.values(deps));
}
function nodes(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  return [node,...(Array.isArray(node.children)?node.children.flatMap(nodes):[])];
}
async function fixture(message: string, web: boolean, messages = zh) {
  const identity={scope:{accountKey:"user:7",epoch:1},instanceKey:"DAY_ONE:one",questCode:"visit_earn"};
  const recovery=createDayOneObservationRecovery();
  await recovery.report({...identity,session:{accessToken:"access",user:{userId:7}},visible:()=>true,isCurrent:()=>true,
    currentInstance:()=>identity.instanceKey, submit:async()=>{throw new ApiError({kind:"http",status:428,code:428,message});}});
  const props={active:true}; const navTo=mock.fn();
  const task={id:"visit_earn",href:"/pages/earn/earn",label:"收益页"};
  const recoverObservation=handler({props,isActionable:()=>true,observationIdentity:()=>identity,dayOneObservationRecovery:recovery,observationRecoveryRoute,navTo},web);
  const reason=recovery.notice(identity)!;
  const tree=render({expanded:true,observationNotices:[{task,reason}],props,t:messages,recoverObservation,
    observationMessage:()=>reason==="terms"?messages.home.dayOneObservationTerms:reason==="onboarding"?messages.home.dayOneObservationSetup:messages.home.dayOneObservationUnconfirmed});
  return {props,navTo,buttons:nodes(tree).filter(node=>node.props?.role==="button"),tree};
}
describe("DayOne card real recovery template and handler",()=>{
  it.each([false,true])("navigates to the normal platform setup without issuing completion (web=%s)",async web=>{
    const f=await fixture("USER_ONBOARDING_REQUIRED",web);
    f.buttons[0].props.onClick();
    expect(f.navTo).toHaveBeenCalledExactlyOnceWith(web?"/pages/register/success?setup=1":"/pages/onboarding/estimator");
  });
  it.each(["Enter"," "])("activates terms once with %s and retains the exact task return",async key=>{
    const f=await fixture("LEGAL_TERMS_ACK_REQUIRED",true);
    const event={key,preventDefault:mock.fn()};
    const handlers=f.buttons[0].props.onKeydown;
    for(const call of Array.isArray(handlers)?handlers:[handlers]) call(event);
    expect(f.navTo).toHaveBeenCalledExactlyOnceWith("/pages/onboarding/terms?return="+encodeURIComponent("/pages/earn/earn"));
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });
  it("offers only the original task retry for an unknown rejection and no inactive actions",async()=>{
    const f=await fixture("UNKNOWN_PRECONDITION",false);
    expect(f.buttons).toHaveLength(1);
    f.props.active=false; f.buttons[0].props.onClick(); expect(f.navTo).not.toHaveBeenCalled();
    f.props.active=true; f.buttons[0].props.onClick(); expect(f.navTo).toHaveBeenCalledExactlyOnceWith("/pages/earn/earn");
  });
  it.each([zh,en,vi])("renders localized actionable text without exposing protocol codes",async messages=>{
    const f=await fixture("USER_ONBOARDING_REQUIRED",false,messages);
    const output=JSON.stringify(f.tree, (key,value)=>key==="ctx"?undefined:value);
    expect(output).toContain(messages.home.dayOneObservationSetup);
    expect(output).toContain(messages.home.dayOneObservationSetupAction);
    expect(output).not.toContain("USER_ONBOARDING_REQUIRED");
    expect(output).not.toContain("428");
  });
});
