// @ts-expect-error App TypeScript excludes Node declarations; this runs in Vitest's Node process.
import { execFileSync } from 'node:child_process';
import { it } from 'vitest';

// Isolate the missing native method from Vitest's own runtime.
const script = String.raw`
import assert from 'node:assert/strict';
import { catchUpConversation } from './src/api/conversation-history.ts';
import { createSupportApi } from './src/api/support-api.ts';
Object.defineProperty(Array.prototype, 'at', { value: undefined, configurable: true, writable: true });
assert.equal(typeof [].at, 'undefined');
const scenario = process.argv[1];
const page = (first,last) => ({ id:'CV-fixture',version:1,
  messages:Array.from({length:last-first+1},(_,i)=>({id:String(first+i),sender:'user',text:'fixture',ts:first+i,status:'sent'})),
  historyTruncated:first>1,historyNextCursor:first>1?first:null });
if (scenario === 'history') {
  const next=page(202,301), noFetch=async()=>{throw new Error('unexpected page read')};
  assert.equal(await catchUpConversation(next,undefined,noFetch,()=>true),next);
  assert.equal(await catchUpConversation(next,{...page(1,1),messages:[]},noFetch,()=>true),next);
  const prior=page(1,1);prior.messages[0].status='read';const calls=[];
  const result=await catchUpConversation(next,prior,async(_,before)=>{
    calls.push(before);return page(Math.max(1,before-100),before-1);
  },()=>true);
  assert.deepEqual(calls,[202,102,2]);assert.equal(result.messages.length,301);
  assert.equal(new Set(result.messages.map(m=>m.id)).size,301);
  assert.equal(result.messages[0].status,'read');assert.equal(result.historyNextCursor,null);
  assert.equal(result.historyTruncated,false);
  await assert.rejects(catchUpConversation(next,page(1,1),async()=>next,()=>true),/SUPPORT_HISTORY_CURSOR_STALLED/);
  let active=true;
  await assert.rejects(catchUpConversation(next,page(1,1),async()=>{
    active=false;return page(102,201);
  },()=>active),/SUPPORT_ACCOUNT_SCOPE_CHANGED/);
} else {
  const row=id=>scenario==='tickets'
    ? {id,ticketNo:'TK-'+id,title:'Fixture',category:'technical',status:'OPEN',priority:'NORMAL',version:1,
       createdAt:1,updatedAt:2,lastMessageAt:3,messageCount:1,userUnreadCount:0,assignedAdminName:''}
    : {id,conversationNo:'CV-'+id,conversationType:'support',status:'CLOSED',version:1,
       lastMessageAt:3,unreadCount:0,ownerAgentName:'',lastMessage:'fixture'};
  for(const length of [0,3,100]) {
    const paths=[],first=Array.from({length},(_,i)=>row(200-i)),second=[row(100),row(99)];
    const total=length===100?102:length;
    const api=createSupportApi({request:async({path})=>{
      paths.push(path);return {total,pageNum:1,pageSize:100,records:path.includes('beforeId=101')?second:first};
    }});
    const result=await api[scenario]();
    assert.equal(result.items.length,total);assert.equal(result.total,total);
    assert.equal(new Set(result.items.map(item=>item.id)).size,total);
    assert.deepEqual(paths,[...['/api/app/support/'+scenario+'/cursor?pageSize=100'],
      ...(length===100?['/api/app/support/'+scenario+'/cursor?pageSize=100&beforeId=101']:[])]);
  }
}
`;

it.each(['history', 'tickets', 'conversations'])('keeps %s recovery working without native Array.at', scenario => {
  const nodeProcess = (globalThis as unknown as { process: { execPath: string; cwd(): string } }).process;
  try { execFileSync(nodeProcess.execPath, ['--experimental-strip-types',
    '--import', './scripts/lib/ts-ext-resolve.mjs', '--input-type=module', '-e', script, scenario],
    { cwd: nodeProcess.cwd(), stdio: 'pipe' }); }
  catch (cause) { throw new Error((cause as { stderr?: { toString(): string } }).stderr?.toString() || 'Native compatibility subprocess failed'); }
});
