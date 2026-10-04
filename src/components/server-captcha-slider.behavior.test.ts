import { afterEach, expect, test, vi } from "vitest";
import { ref, computed } from "vue";
import ts from "typescript";
import raw from "./server-captcha-slider.vue?raw";
import { readMonotonicNowMs } from "@/lib/server-deadline-clock";
const script=raw.split('<script setup lang="ts">')[1].split("</script>")[0].replace(/^import .*;$/gm, "");
const code=ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const fixture={challengeId:"challenge-0123456789abcdef",backgroundImage:"data:image/png;base64,YQ==",pieceImage:"data:image/png;base64,YQ==",width:320,height:160,pieceWidth:44,pieceHeight:44,pieceY:40,expiresInSec:120};
function deferred<T>(){let resolve!:(v:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};}
function mount(api:any){
 let unmount=()=>{},changed=()=>{};const emit=vi.fn();
 const props={phone:"+84901234567",scene:"LOGIN"};
 const query:any={in:()=>query,select:()=>query,boundingClientRect:(fn:any)=>{fn({width:324});return query;},exec:()=>{}};
 const names=["ref","computed","onMounted","onUnmounted","getCurrentInstance","nextTick","watch","useT","fmt","useDialogA11y","apiClient","createCaptchaApi","readMonotonicNowMs","defineProps","defineEmits","uni"];
 const factory=new Function(...names,code+";return {loadChallenge,onCancel,onDown,onMove,onUp,onHandleKeydown,challenge,busy,curX,hintText};");
 const state=factory(ref,computed,()=>{},(fn:any)=>{unmount=fn;},()=>null,()=>Promise.resolve(),(_:any,fn:any)=>{changed=fn;},()=>({value:{authOtp:{captchaVerified:"ok",captchaFail:"failed",captchaLoadFailed:"unavailable",captchaThrottled:"throttled",captchaFailCount:"count"}}}),()=>"",()=>{},null,()=>api,readMonotonicNowMs,()=>props,()=>emit,{createSelectorQuery:()=>query});
 return {...state,emit,props,unmount:()=>unmount(),changed:()=>changed()};
}
afterEach(()=>vi.useRealTimers());
test("closed challenge response cannot restore puzzle",async()=>{
 const d=deferred<any>();const s=mount({challenge:()=>d.promise});const read=s.loadChallenge();s.onCancel();d.resolve(fixture);await read;expect(s.challenge.value).toBeNull();expect(s.emit).toHaveBeenCalledExactlyOnceWith("close");
});
test("new challenge wins over a late previous response",async()=>{
 const a=deferred<any>(),b=deferred<any>();const api={challenge:vi.fn().mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)};const s=mount(api);const first=s.loadChallenge(),second=s.loadChallenge();b.resolve({...fixture,challengeId:"new"});await second;a.resolve(fixture);await first;expect(s.challenge.value.challengeId).toBe("new");
});
test("closing during verification suppresses success and code-send callback",async()=>{
 vi.useFakeTimers();const d=deferred<any>();const s=mount({challenge:async()=>fixture,verify:()=>d.promise});await s.loadChallenge();s.onDown({clientX:0});s.onMove({clientX:120});const verify=s.onUp();s.onCancel();d.resolve({ticket:"server-ticket",expiresInSec:60});await verify;await vi.runAllTimersAsync();expect(s.emit.mock.calls).toEqual([["close"]]);
});
test("pointer correction keeps raw coordinates and bounded trail",async()=>{
 const api={challenge:async()=>fixture,verify:vi.fn().mockResolvedValue({ticket:"server-ticket",expiresInSec:60})};const s=mount(api);await s.loadChallenge();s.onDown({clientX:0});for(let x=1;x<=160;x++)s.onMove({clientX:x});s.onMove({clientX:140.4});await s.onUp();const proof=api.verify.mock.calls[0][0];expect(proof.inputMethod).toBe("pointer");expect(proof.trail.length).toBeLessThanOrEqual(128);expect(proof.trail.at(-1).x).toBe(proof.offsetX);expect(proof.offsetX).toBe(140);expect(Number.isInteger(proof.offsetX)).toBe(true);expect(proof.trail.every((point:any)=>Number.isInteger(point.x))).toBe(true);s.unmount();
});
test("native gesture clock works without performance and never reverses trail time",async()=>{
 const api={challenge:async()=>fixture,verify:vi.fn().mockResolvedValue({ticket:"server-ticket",expiresInSec:60})};
 const pointer=mount(api),keyboard=mount(api);pointer.props.scene="REGISTER";await pointer.loadChallenge();await keyboard.loadChallenge();
 let now=1000;const dateNow=vi.spyOn(Date,"now").mockImplementation(()=>now);vi.stubGlobal("performance",undefined);
 const arrayAt=Array.prototype.at;Object.defineProperty(Array.prototype,"at",{configurable:true,value:undefined});
 try{
  pointer.onDown({clientX:0});now=1020;pointer.onMove({clientX:120});now=1010;await pointer.onUp();
  now=2000;keyboard.onHandleKeydown({key:"End",preventDefault:()=>{}});keyboard.onHandleKeydown({key:"Enter",preventDefault:()=>{}});await Promise.resolve();
 }finally{Object.defineProperty(Array.prototype,"at",{configurable:true,value:arrayAt});vi.unstubAllGlobals();dateNow.mockRestore();pointer.unmount();keyboard.unmount();}
 const pointerProof=api.verify.mock.calls[0][0],keyboardProof=api.verify.mock.calls[1][0];
 expect(pointerProof.scene).toBe("REGISTER");expect(pointerProof.inputMethod).toBe("pointer");expect(pointerProof.trail.map((point:any)=>point.t)).toEqual([0,20,20]);expect(pointerProof.offsetX).toBeGreaterThan(0);
 expect(keyboardProof.inputMethod).toBe("keyboard");expect(keyboardProof.trail[0].t).toBe(0);expect(keyboardProof.offsetX).toBeGreaterThan(0);
});
test("keyboard uses the same server verifier and permits left correction",async()=>{
 const api={challenge:async()=>fixture,verify:vi.fn().mockResolvedValue({ticket:"server-ticket",expiresInSec:60})};const s=mount(api);await s.loadChallenge();for(const key of ["ArrowRight","ArrowRight","ArrowLeft","Enter"])s.onHandleKeydown({key,preventDefault:()=>{}});await Promise.resolve();expect(api.verify).toHaveBeenCalledOnce();expect(api.verify.mock.calls[0][0].inputMethod).toBe("keyboard");expect(api.verify.mock.calls[0][0].offsetX).toBeCloseTo(2);s.unmount();
});

test("changing phone during verification invalidates its ticket",async()=>{
 vi.useFakeTimers();const d=deferred<any>();const api={challenge:vi.fn().mockResolvedValue(fixture),verify:()=>d.promise};const s=mount(api);await s.loadChallenge();s.onDown({clientX:0});s.onMove({clientX:100});const pending=s.onUp();s.props.phone="+84909999999";s.changed();d.resolve({ticket:"old-ticket",expiresInSec:60});await pending;await vi.runAllTimersAsync();expect(s.emit).not.toHaveBeenCalled();expect(api.challenge).toHaveBeenCalledTimes(2);s.unmount();
});
test("failed proof clears consumed challenge and retry obtains a new one",async()=>{
 const api={challenge:vi.fn().mockResolvedValueOnce(fixture).mockResolvedValueOnce({...fixture,challengeId:"new-challenge"}),verify:vi.fn().mockRejectedValue(new Error("expired"))};const s=mount(api);await s.loadChallenge();s.onDown({clientX:0});s.onMove({clientX:100});await s.onUp();expect(s.challenge.value).toBeNull();expect(s.emit).not.toHaveBeenCalled();await s.onUp();expect(api.verify).toHaveBeenCalledTimes(1);await s.loadChallenge();expect(s.challenge.value.challengeId).toBe("new-challenge");s.unmount();
});

test.each([["USER_CAPTCHA_CHALLENGE_FAILED","failed"],["USER_CAPTCHA_CHALLENGE_EXPIRED","failed"],["USER_CAPTCHA_CHALLENGE_REPLAYED","failed"],["USER_CAPTCHA_CHALLENGE_INVALID","failed"],["USER_CAPTCHA_CHALLENGE_IP_MISMATCH","failed"],["USER_CAPTCHA_CHALLENGE_SCENE_MISMATCH","failed"],["USER_CAPTCHA_TICKET_RATE_LIMITED","throttled"],["USER_CAPTCHA_CHALLENGE_RATE_LIMITED","throttled"],["USER_CAPTCHA_CLIENT_ADDRESS_INVALID","failed"],["network","unavailable"],["USER_CAPTCHA_VERIFIER_UNAVAILABLE","unavailable"]])("verification error %s uses accurate recovery guidance",async(message,expected)=>{
 const s=mount({challenge:async()=>fixture,verify:async()=>{throw new Error(message);}});await s.loadChallenge();s.onDown({clientX:0});s.onMove({clientX:100});await s.onUp();expect(s.hintText.value).toBe(expected);expect(s.challenge.value).toBeNull();s.unmount();
});

test.each([["USER_CAPTCHA_CHALLENGE_RATE_LIMITED","throttled"],["network","unavailable"]])("challenge error %s uses accurate recovery guidance",async(message,expected)=>{const s=mount({challenge:async()=>{throw new Error(message);}});await s.loadChallenge();expect(s.hintText.value).toBe(expected);s.unmount();});
