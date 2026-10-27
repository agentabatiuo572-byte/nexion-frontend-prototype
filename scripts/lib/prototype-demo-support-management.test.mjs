import test from 'node:test';
import assert from 'node:assert/strict';
import { supportDemo } from './prototype-demo-support.mjs';
import { createPrototypeMessages } from './prototype-message-demo.mjs';
const origin='http://127.0.0.1',root='/api/app/support';
const call=(state,path,method='GET',input={},key)=>supportDemo(new URL(root+path,origin),'zh',state,{
  method:()=>method,postDataJSON:()=>input,headers:()=>({'idempotency-key':key}),
});
const create=(state,key,body=key)=>call(state,'/conversations','POST',{conversationType:'SUPPORT',openingText:body,clientMessageId:key});
function deletion(state,id,key='delete-history-key') {
  const detail=state.supportConversations.find(row=>row.conversation.conversationNo===id),peerKey='agent:'+detail.conversation.ownerAgentId;
  const members=state.supportConversations.filter(row=>'agent:'+row.conversation.ownerAgentId===peerKey);
  return {id,key,input:{scope:'USER_VIEW',peerKey,conversationIds:members.map(row=>row.conversation.conversationNo).sort(),
    expectedVersions:Object.fromEntries(members.map(row=>[row.conversation.conversationNo,row.conversation.version]))}};
}
const remove=(state,request)=>call(state,'/conversations/'+request.id,'DELETE',request.input,request.key);

test('R19 same-staff creates reuse the original cid through reload and retain every history page',()=>{
  const state={messageState:'history'};
  call(state,'/conversations/cursor'); const original=state.supportConversations[0].messages.map(row=>row.id);
  const first=create(state,'opening-key-a'),cid=first.conversation.conversationNo;
  const restored=JSON.parse(JSON.stringify(state)); create(restored,'opening-key-b');
  assert.equal(restored.supportConversations.length,1); assert.equal(cid,'DEMO-SUPPORT-1');
  assert.deepEqual(restored.supportConversations[0].messages.slice(0,24).map(row=>row.id),original);
  const history=[];let cursor=null;
  do {
    const page=call(restored,`/conversations/${cid}${cursor?'?beforeMessageId='+cursor:''}`);
    history.unshift(...page.messages);cursor=page.nextCursor;
  } while(cursor);
  assert.equal(history.length,26); assert.equal(new Set(history.map(row=>row.id)).size,26);
  create(restored,'opening-key-b'); assert.equal(restored.supportConversations[0].messages.length,26);
});

test('R19 identity uses staff ids even when names match or an old archive lacks demo ids',()=>{
  const state={}; create(state,'staff-one-key'); state.supportAdvisorId=2;
  const second=create(state,'staff-two-key'); assert.equal(second.conversation.conversationNo,'DEMO-SUPPORT-2');
  state.supportConversations.forEach(row=>row.conversation.ownerAgentName='Same name');
  state.supportAdvisorId=1; assert.equal(create(state,'staff-one-again').conversation.conversationNo,'DEMO-SUPPORT-1');
  assert.equal(state.supportConversations.length,2);
  delete state.supportConversations[0].conversation.ownerAgentId;
  const messages=structuredClone(state.supportConversations.map(row=>row.messages));
  call(state,'/conversations/cursor');
  assert.equal(state.supportConversations[0].conversation.ownerAgentId,'1');
  assert.deepEqual(state.supportConversations.map(row=>row.messages),messages);
});

test('R19 user clear retains staff history, survives restart/storage change and allows the same cid to reappear only after the boundary',()=>{
  const state={}; create(state,'staff-one-key','R19 private synthetic body'); state.supportAdvisorId=2; create(state,'staff-two-key');
  const legacy=structuredClone(state.supportConversations.find(row=>row.conversation.ownerAgentId==='1'));
  legacy.conversation.id=3; legacy.conversation.conversationNo='DEMO-SUPPORT-3'; legacy.messages=[];
  legacy.conversation.lastPublicMessageId=0;state.supportConversations.push(legacy);
  call(state,'/conversations/cursor');
  const archive=structuredClone(state.supportConversations);
  const request=deletion(state,'DEMO-SUPPORT-1'); const result=remove(state,request);
  assert.deepEqual(result.conversationNos,['DEMO-SUPPORT-1','DEMO-SUPPORT-3']);
  assert.equal(result.scope,'USER_VIEW'); assert.equal(result.userScopeCleared,true);
  assert.equal('historyCleared' in result,false); assert.equal('deletedConversationNos' in result,false);
  assert.deepEqual(state.supportConversations,archive);
  const restored=JSON.parse(JSON.stringify(state)); assert.deepEqual(remove(restored,request),result);
  assert.deepEqual(call(restored,'/conversations/DEMO-SUPPORT-1').messages,[]);
  assert.equal(call(restored,'/conversations/DEMO-SUPPORT-1').conversation.lastMessage,'');
  assert.deepEqual(create(restored,'staff-one-key','R19 private synthetic body').messages,[]);
  assert.deepEqual(call(restored,'/conversations/cursor').records.map(row=>row.conversationNo),['DEMO-SUPPORT-2']);
  assert.deepEqual(call(restored,'/conversation-management'),{clearUserHistory:true,clearedPeers:[result]});
  restored.supportAccountId=900002;
  assert.ok(call(restored,'/conversations/DEMO-SUPPORT-1').messages.length>0);
  assert.deepEqual(call(restored,'/conversation-management').clearedPeers,[]);
  restored.supportAccountId=900001;
  restored.supportAdvisorId=1; const fresh=create(restored,'fresh-after-deletion');
  assert.equal(fresh.conversation.conversationNo,'DEMO-SUPPORT-3'); assert.equal(fresh.messages.length,1);
  assert.ok(fresh.messages[0].id>result.throughMessageId);
  assert.equal(restored.supportConversations.length,3);
  assert.ok(restored.supportConversations.find(row=>row.conversation.conversationNo==='DEMO-SUPPORT-1').messages.some(row=>row.content==='R19 private synthetic body'));
  const again=deletion(restored,'DEMO-SUPPORT-3','second-clear-key');
  // The user's list now contains only this cid; the server still covers hidden legacy cids.
  again.input.conversationIds=['DEMO-SUPPORT-3'];
  again.input.expectedVersions={'DEMO-SUPPORT-3':fresh.conversation.version};
  remove(restored,again);
  assert.deepEqual(call(restored,'/conversations/DEMO-SUPPORT-3').messages,[]);
});

test('R19 a changed version or foreign peer cannot clear any history',()=>{
  const state={};create(state,'first-key');const request=deletion(state,'DEMO-SUPPORT-1');
  const before=JSON.stringify(state);
  for(const input of [{...request.input,peerKey:'agent:other'}, {...request.input,expectedVersions:{'DEMO-SUPPORT-1':999}}]) {
    assert.throws(()=>remove(state,{...request,input}),{status:409}); assert.equal(JSON.stringify(state),before);
  }
  remove(state,request);
  assert.throws(()=>remove(state,{...request,input:{...request.input,peerKey:'agent:other'}}),{status:409});
});

test('R19 cached retries and restored command reads cannot reveal cleared bodies or append the original command again',async()=>{
  const state={}; const fixtureFor=(url,request)=>supportDemo(url,'zh',state,request);
  const messages=createPrototypeMessages({state,fixtureFor});
  const input={conversationType:'SUPPORT',openingText:'R19 private message',clientMessageId:'message-delete-cache-key'};
  const request={method:()=> 'POST',postDataJSON:()=>input,headers:()=>({'idempotency-key':input.clientMessageId})};
  const sent=await messages.request(new URL(root+'/conversations',origin),request);
  const removeRequest=deletion(state,sent.body.data.conversation.conversationNo);
  remove(state,removeRequest);
  const count=state.supportConversations[0].messages.length;
  const replay=await messages.request(new URL(root+'/conversations',origin),request);
  assert.equal(replay.status,200); assert.deepEqual(replay.body.data.messages,[]);
  assert.equal(state.supportConversations[0].messages.length,count);
  const read={method:()=> 'GET'};
  assert.deepEqual((await messages.request(new URL(root+'/commands/'+input.clientMessageId,origin),read)).body.data.result.messages,[]);
  const restored=JSON.parse(JSON.stringify(state)),next=createPrototypeMessages({state:restored,fixtureFor:(url,req)=>supportDemo(url,'zh',restored,req)});
  const receipt=await next.request(new URL(root+'/commands/'+removeRequest.key,origin),read);
  assert.equal(receipt.body.data.resultType,'CONVERSATION_USER_CLEAR');
  assert.deepEqual((await next.request(new URL(root+'/commands/'+input.clientMessageId,origin),read)).body.data.result.messages,[]);
  assert.deepEqual(call(restored,'/conversations/cursor').records,[]);
});

test('R19 history pagination and incoming messages respect the account boundary without changing archived IDs',()=>{
  const state={messageState:'history'};call(state,'/conversations/cursor');
  const cid='DEMO-SUPPORT-1',archive=structuredClone(state.supportConversations[0].messages);
  const cleared=remove(state,deletion(state,cid));
  state.messageState='incoming';
  const list=call(state,'/conversations/cursor');
  assert.equal(list.records.length,1);assert.equal(list.records[0].unreadCount,1);
  const page=call(state,'/conversations/'+cid);
  assert.equal(page.messages.length,1);assert.ok(page.messages[0].id>cleared.throughMessageId);
  assert.equal(page.historyTruncated,false);assert.equal(page.nextCursor,null);
  assert.deepEqual(call(state,`/conversations/${cid}?beforeMessageId=${page.messages[0].id}`).messages,[]);
  assert.deepEqual(state.supportConversations[0].messages.slice(0,24).map(row=>row.id),archive.map(row=>row.id));
  assert.equal(state.supportConversations[0].messages.length,25);
});

test('R19 a clear command receipt is account-scoped and replay cannot advance the saved boundary',async()=>{
  const state={};create(state,'first-message-key');
  const request=deletion(state,'DEMO-SUPPORT-1'),receipt=remove(state,request);
  create(state,'second-message-key');
  assert.deepEqual(remove(state,request),receipt);
  assert.equal(call(state,'/conversations/DEMO-SUPPORT-1').messages.length,1);
  const transport=createPrototypeMessages({state,fixtureFor:(url,req)=>supportDemo(url,'zh',state,req)});
  state.supportAccountId=900002;
  const other=await transport.request(new URL(root+'/commands/'+request.key,origin),{method:()=> 'GET'});
  assert.equal(other.body.data,null);
  assert.ok(call(state,'/conversations/DEMO-SUPPORT-1').messages.length>1);
});
