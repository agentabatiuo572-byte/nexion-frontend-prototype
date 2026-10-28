import ts from 'typescript';
import * as Vue from 'vue';
import {expect,it,vi} from 'vitest';
import source from './security.vue?raw';
import {ApiError} from '@/api/errors';
import {createP318AccountPageFence} from './p3-18-account-page-fence';

function setup() {
  const app=Vue.reactive({accountKey:'A',accountBindingEpoch:1});
  const fence=createP318AccountPageFence(()=>app.accountKey,()=>app.accountBindingEpoch);
  const names=['securityBusy','remoteSecurityLoading','sessionPageLoading','remoteSecurity','securityPresentation','phonePolicy','phoneEditing','phoneNext','phonePassword','phoneOldCode','phoneNewCode','phoneChallenge','phoneError','deletionStatus','editingPwd','current','next','confirmPwd','twoFactorPassword','twoFactorPasswordError','twoFactorPasswordFocus','twoFactorCode','twoFactorChallengeNo','twoFactorPhoneMasked','twoFactorTarget','deletionPassword','deletionCommandKey','err'];
  const refs=Object.fromEntries(names.map(name=>[name,Vue.ref(null)])) as Record<string,Vue.Ref<any>>;
  const api={securityOverview:vi.fn(),accountDeletionStatus:vi.fn(async()=>({status:'NONE'})),revokeSession:vi.fn(),revokeOtherSessions:vi.fn()};
  const uiConfirm=vi.fn(async()=>true),ui={clearConfirmsBy:vi.fn()};
  const bag={...refs,ApiError,securityPageFence:fence,auth:{get accountId(){return app.accountKey;}},
    securityEnvironmentInvalidated:false,securityPageVisible:true,remoteApiEnabled:true,
    captureAccountScope:()=>`${app.accountKey}:${app.accountBindingEpoch}`,
    isCurrentAccountScope:(s:string)=>s===`${app.accountKey}:${app.accountBindingEpoch}`,
    accountApi:api,securityConfirmOwner:'test',ui,t:{value:{security:{opFailed:'Failed'}}},
    toast:{success:vi.fn(),error:vi.fn()},securityErrorMessage:()=> 'Failed',sessionDeviceLabel:()=> 'Device',
    uiConfirm,hasOtherSessions:Vue.ref(true),session:{}};
  const script=source.split('<script setup lang="ts">')[1].split('</script>')[0];
  const parsed=ts.createSourceFile('security.ts',script,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const selected=['isCurrentSecurityRequest','clearSecurityAccountState','loadRemoteSecurity','loadMoreSessions','handleRevoke','handleRevokeAll'];
  const code=parsed.statements.filter(n=>ts.isFunctionDeclaration(n)&&selected.includes(n.name?.text??'')).map(n=>n.getText(parsed)).join('\n');
  const js=ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const actions=new Function(...Object.keys(bag),js+';return {loadRemoteSecurity,loadMoreSessions,clearSecurityAccountState,handleRevoke,handleRevokeAll};')(...Object.values(bag));
  return {app,api,refs,actions,uiConfirm};
}
const snapshot={twoFactorEnabled:true,passwordChangedAt:'2026-10-25',sessions:[{id:'s1',current:false,deviceName:'Confirmed'}],nextCursor:'cursor1'};
it('retains warm metadata while live authority is cleared and cannot revoke until the read succeeds',async()=>{
 const p=setup();p.api.securityOverview.mockResolvedValue(snapshot);await p.actions.loadRemoteSecurity();
 let finish!:(v:any)=>void;p.api.securityOverview.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 const read=p.actions.loadRemoteSecurity();expect(p.refs.remoteSecurity.value).toBeNull();
 expect(p.refs.securityPresentation.value.sessions[0].deviceName).toBe('Confirmed');
 await p.actions.handleRevoke({id:'s1'});await p.actions.handleRevokeAll();
 expect(p.uiConfirm).not.toHaveBeenCalled();expect(p.api.revokeSession).not.toHaveBeenCalled();
 finish(snapshot);await read;expect(p.refs.remoteSecurity.value).toEqual(snapshot);
});
it.each([401,403])('clears metadata and every private form after ordinary %s, with no stale recovery',async status=>{
 const p=setup();p.api.securityOverview.mockResolvedValue(snapshot);await p.actions.loadRemoteSecurity();
 for(const name of ['current','next','confirmPwd','phonePassword','phoneOldCode','phoneNewCode','twoFactorPassword','twoFactorCode','twoFactorChallengeNo','deletionPassword','deletionCommandKey'])p.refs[name].value='private';
 p.api.securityOverview.mockRejectedValueOnce(new ApiError({kind:'http',status,code:status,message:'FORBIDDEN'}));
 expect(await p.actions.loadRemoteSecurity()).toBe(false);expect(p.refs.securityPresentation.value).toBeNull();
 for(const name of ['current','next','confirmPwd','phonePassword','phoneOldCode','phoneNewCode','twoFactorPassword','twoFactorCode','twoFactorChallengeNo','deletionPassword','deletionCommandKey'])expect(p.refs[name].value).toBe('');
 p.api.securityOverview.mockResolvedValue({...snapshot,twoFactorEnabled:false,sessions:[]});await p.actions.loadRemoteSecurity();
 expect(p.refs.securityPresentation.value.sessions).toEqual([]);expect(p.refs.twoFactorPassword.value).toBe('');
});
it('ignores old account success and errors and updates session presentation only from current pagination',async()=>{
 const p=setup();let finish!:(v:any)=>void;p.api.securityOverview.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
 const old=p.actions.loadRemoteSecurity();p.app.accountBindingEpoch++;p.actions.clearSecurityAccountState();finish(snapshot);await old;
 expect(p.refs.securityPresentation.value).toBeNull();
 p.api.securityOverview.mockResolvedValue(snapshot);await p.actions.loadRemoteSecurity();
 p.api.securityOverview.mockResolvedValue({...snapshot,nextCursor:null,sessions:[{id:'s2',deviceName:'Next'}]});await p.actions.loadMoreSessions();
 expect(p.refs.securityPresentation.value.sessions.map((s:any)=>s.id)).toEqual(['s1','s2']);
});
it('rechecks live read readiness after the revoke confirmation',async()=>{
 const p=setup();p.api.securityOverview.mockResolvedValue(snapshot);await p.actions.loadRemoteSecurity();
 let confirm!:(v:boolean)=>void;p.uiConfirm.mockImplementationOnce(()=>new Promise(r=>{confirm=r;}));
 const revoke=p.actions.handleRevoke({id:'s1'});p.refs.remoteSecurity.value=null;confirm(true);await revoke;
 expect(p.api.revokeSession).not.toHaveBeenCalled();
});
