import test from 'node:test';
import assert from 'node:assert/strict';
import { supportDemo } from './prototype-demo-support.mjs';
import { createPrototypeMessages } from './prototype-message-demo.mjs';

const root='/api/app/support';
const request=(state,path,body)=>supportDemo(new URL(root+path,'http://127.0.0.1'),'zh',state,{
  method:()=>body===undefined?'GET':'POST',postDataJSON:()=>body,
});
const create=(state,key)=>request(state,'/conversations',{conversationType:'SUPPORT',openingText:key,clientMessageId:key});
const reply=(state,no,key)=>request(state,`/conversations/${no}/replies`,{body:key,clientMessageId:key});
const allMessages=state=>state.supportConversations.flatMap(detail=>detail.messages);
function assertGlobalIds(state) {
  const messages=allMessages(state);
  assert.ok(messages.every(message=>Number.isSafeInteger(message.id)&&message.id>0));
  // The real chat aggregates all human conversations using this key.
  assert.equal(new Map(messages.map(message=>[String(message.id),message])).size,messages.length);
  for(const detail of state.supportConversations) {
    assert.ok(detail.messages.every((message,index)=>!index||message.id>detail.messages[index-1].id));
    assert.equal(detail.conversation.lastPublicMessageId,detail.messages.at(-1).id);
  }
}
function pages(state,no) {
  const messages=[];
  let cursor;
  do {
    const page=request(state,`/conversations/${no}${cursor?`?beforeMessageId=${cursor}`:''}`);
    assert.ok(page.messages.length);
    if(cursor)assert.ok(page.messages.every(message=>message.id<cursor));
    messages.unshift(...page.messages);
    const next=page.nextCursor;
    assert.equal(page.historyTruncated,next!==null);
    if(next!==null)assert.ok(!cursor||next<cursor);
    cursor=next;
  } while(cursor!==null);
  return messages;
}
function legacyDetail(id,ids) {
  const messages=ids.map((messageId,index)=>({
    id:messageId,...(index?{clientMessageId:`c${id}-m${index}`} : {}),senderType:index%2?'agent':'user',
    content:`Saved conversation ${id}, message ${index}`,createdAt:new Date(Date.UTC(2026,9,id,0,index)).toISOString(),
    receiptStatus:index%2?'read':'sent',...(index===2?{kind:'IMAGE',attachmentId:`saved-image-${id}`}:{kind:'TEXT'}),
  }));
  return {
    clientMessageId:`open-${id}`,
    conversation:{id,conversationNo:`DEMO-SUPPORT-${id}`,conversationType:'support',status:'OPEN',version:7,
      unreadCount:3,lastMessage:messages.at(-1).content,lastMessageAt:messages.at(-1).createdAt,lastPublicMessageId:ids.at(-1)},
    messages,historyTruncated:false,nextCursor:null,
  };
}

test('new conversations and interleaved replies survive global human-history aggregation',()=>{
  const state={};
  const opening=create(state,'open-2');
  assert.equal(opening.conversation.conversationNo,'DEMO-SUPPORT-2');
  assertGlobalIds(state);
  const firstId=opening.messages[0].id;
  const firstReply=reply(state,'DEMO-SUPPORT-1','reply-1').messages.at(-1).id;
  const secondReply=reply(state,'DEMO-SUPPORT-2','reply-2').messages.at(-1).id;
  assert.ok(firstId<firstReply&&firstReply<secondReply);
  assertGlobalIds(state);
  const saved=JSON.stringify(state);
  assert.equal(create(state,'open-2').messages[0].id,firstId);
  reply(state,'DEMO-SUPPORT-1','reply-1');
  assert.equal(JSON.stringify(state),saved,'replaying the original keys must not append or renumber messages');
});

test('incoming agent messages allocate after messages in every other conversation',()=>{
  const state={};
  create(state,'open-2');
  const previous=reply(state,'DEMO-SUPPORT-1','latest-elsewhere').messages.at(-1).id;
  state.messageState='incoming';
  const incoming=request(state,'/conversations/DEMO-SUPPORT-2');
  assert.ok(incoming.messages.at(-1).id>previous);
  assert.equal(incoming.messages.at(-1).senderType,'agent');
  assert.equal(incoming.messages[0].receiptStatus,'read');
  assertGlobalIds(state);
  const saved=JSON.stringify(state);
  request(state,'/conversations/DEMO-SUPPORT-2');
  assert.equal(JSON.stringify(state),saved,'reading an incoming scenario must not append twice');
});

for(const scenario of ['history','timeline','receipts']) {
  test(`${scenario} replacement retains other conversations and supplies globally unique paged messages`,()=>{
    const state={};
    const opening=create(state,'open-2');
    const openingId=opening.messages[0].id;
    const other=structuredClone(state.supportConversations[1]);
    state.messageState=scenario;
    request(state,'/conversations/DEMO-SUPPORT-2');
    const detail=state.supportConversations[0];
    assertGlobalIds(state);
    assert.deepEqual(state.supportConversations[1],other);
    assert.ok(detail.messages[0].id>openingId,'a scenario must not recycle IDs of messages it replaced');
    assert.equal(detail.messages.length,scenario==='receipts'?6:24);
    assert.deepEqual(pages(state,'DEMO-SUPPORT-2'),detail.messages);
    if(scenario!=='receipts') {
      assert.ok(detail.messages.some(message=>message.kind==='IMAGE'));
      assert.ok(detail.messages.some(message=>message.kind==='SKU'));
    }
  });
}

test('restored legacy collisions preserve history, metadata, references and original command keys',()=>{
  const state={messageState:'normal',supportScenario:'normal',supportHistory:true,
    supportConversations:[legacyDetail(2,Array.from({length:12},(_,i)=>i+1)),legacyDetail(1,Array.from({length:24},(_,i)=>i+1)),legacyDetail(3,[30,31])],
    supportDismissals:[{conversationNo:'DEMO-SUPPORT-2',throughMessageId:7},{conversationNo:'DEMO-SUPPORT-1',throughMessageId:24}],
    unrelatedDraft:{text:'Keep this local session'},
  };
  state.supportConversations[0].nextCursor=5;
  const original=structuredClone(state);
  const detail=state.supportConversations[0];
  request(state,'/conversations/cursor');
  assertGlobalIds(state);
  assert.strictEqual(state.supportConversations[0],detail);
  assert.deepEqual(state.supportConversations.map(row=>row.conversation.conversationNo),original.supportConversations.map(row=>row.conversation.conversationNo));
  for(let index=0;index<state.supportConversations.length;index++) {
    const current=state.supportConversations[index],before=original.supportConversations[index];
    assert.deepEqual(current.messages.map(({id,...message})=>message),before.messages.map(({id,...message})=>message));
    assert.deepEqual({...current.conversation,lastPublicMessageId:before.conversation.lastPublicMessageId},before.conversation);
  }
  assert.deepEqual(state.supportConversations[1],original.supportConversations[1],'the oldest conversation keeps its existing IDs');
  assert.deepEqual(state.supportConversations[2],original.supportConversations[2],'unrelated unique IDs stay unchanged');
  assert.deepEqual(state.unrelatedDraft,original.unrelatedDraft);
  assert.equal(detail.nextCursor,detail.messages[4].id);
  assert.equal(state.supportDismissals[0].throughMessageId,detail.messages[6].id);
  assert.deepEqual(state.supportDismissals[1],original.supportDismissals[1]);
  assert.deepEqual(pages(state,'DEMO-SUPPORT-2'),detail.messages);
  const saved=JSON.stringify(state);
  request(state,'/conversations/cursor');
  assert.equal(JSON.stringify(state),saved,'migration runs only once for these IDs');
  const restored=JSON.parse(saved);
  request(restored,'/conversations',{conversationType:'SUPPORT',openingText:detail.messages[0].content,clientMessageId:'open-2'});
  request(restored,'/conversations/DEMO-SUPPORT-2/replies',{body:detail.messages[4].content,clientMessageId:'c2-m4'});
  assert.equal(JSON.stringify(restored),saved,'restoring and replaying old commands must keep canonical IDs and history');
});

test('valid sparse IDs remain stable and new allocations continue across state export/restore',()=>{
  const state={messageState:'normal',supportScenario:'normal',supportConversations:[legacyDetail(2,[100,150]),legacyDetail(1,[2,9])]};
  const before=structuredClone(state.supportConversations);
  request(state,'/conversations/cursor');
  assert.deepEqual(state.supportConversations,before);
  const sent=reply(state,'DEMO-SUPPORT-1','sparse-reply');
  assert.ok(sent.messages.at(-1).id>150);
  const restored=JSON.parse(JSON.stringify(state));
  const next=reply(restored,'DEMO-SUPPORT-2','after-restore');
  assert.ok(next.messages.at(-1).id>sent.messages.at(-1).id);
  assertGlobalIds(restored);
});

test('legacy dismissal and cursor boundaries still select the same messages when their old IDs are absent',()=>{
  for(const boundary of [6,12]) {
    const state={messageState:'normal',supportScenario:'normal',supportHistory:true,
      supportConversations:[legacyDetail(2,[1,4,9]),legacyDetail(1,[1,50])],
      supportDismissals:[{conversationNo:'DEMO-SUPPORT-2',throughMessageId:boundary}],
    };
    const detail=state.supportConversations[0];
    detail.nextCursor=boundary;
    const dismissed=detail.messages.filter(message=>message.id<=boundary).map(message=>message.clientMessageId);
    const earlier=detail.messages.filter(message=>message.id<boundary).map(message=>message.clientMessageId);
    request(state,'/conversation-dismissals');
    const marker=state.supportDismissals[0];
    assert.deepEqual(detail.messages.filter(message=>message.id<=marker.throughMessageId).map(message=>message.clientMessageId),dismissed);
    const page=request(state,`/conversations/DEMO-SUPPORT-2?beforeMessageId=${detail.nextCursor}`);
    assert.deepEqual(page.messages.map(message=>message.clientMessageId),earlier);
    const sent=reply(state,'DEMO-SUPPORT-2','after-dismissal');
    assert.ok(sent.messages.at(-1).id>marker.throughMessageId,'a later message must remain visible after dismissal');
    assertGlobalIds(state);
  }
});

test('UNKNOWN, original-key retry and command readback keep one canonical message, including after restore',async()=>{
  const state={messageSendState:'unknown'};
  const transport=state=>createPrototypeMessages({state,fixtureFor:(url,request)=>supportDemo(url,'zh',state,request)});
  const send=(messages,key,content=key)=>messages.request(new URL(root+'/conversations','http://127.0.0.1'),{
    method:()=> 'POST',headers:()=>({'idempotency-key':key}),
    postDataJSON:()=>({conversationType:'SUPPORT',openingText:content,clientMessageId:key}),
  });
  const readback=(messages,key)=>messages.request(new URL(root+'/commands/'+key,'http://127.0.0.1'),{method:()=> 'GET'});
  const messages=transport(state);
  assert.equal((await send(messages,'uncertain-opening')).status,504);
  assertGlobalIds(state);
  const id=state.supportConversations[0].messages[0].id;
  const saved=JSON.stringify(state);
  assert.equal((await readback(messages,'uncertain-opening')).body.data,null);
  const confirmed=await send(messages,'uncertain-opening');
  assert.equal(confirmed.status,200);
  assert.equal(confirmed.body.data.messages[0].id,id);
  assert.equal((await readback(messages,'uncertain-opening')).body.data.result.messages[0].id,id);
  assert.equal((await send(messages,'uncertain-opening','different content')).status,409);
  assert.equal(JSON.stringify(state),saved);
  const restored=JSON.parse(saved),restarted=transport(restored);
  assert.equal((await send(restarted,'uncertain-opening')).status,504);
  assert.equal((await send(restarted,'uncertain-opening')).body.data.messages[0].id,id);
  assert.equal(JSON.stringify(restored),saved);
  state.messageSendState='failed';
  const rejectedState=JSON.stringify(state);
  assert.equal((await send(messages,'explicit-rejection')).status,422);
  assert.equal(JSON.stringify(state),rejectedState,'an explicit rejection must not allocate or append a message');
});

function commands(state) {
  const transport=createPrototypeMessages({state,fixtureFor:(url,request)=>supportDemo(url,'zh',state,request)});
  return (path,input)=>transport.request(new URL(root+path,'http://127.0.0.1'),{
    method:()=> 'POST',headers:()=>({'idempotency-key':input.clientMessageId}),postDataJSON:()=>input,
  });
}
async function committedCommand(operation) {
  const state={},send=commands(state);
  const path=operation==='create'?'/conversations':'/conversations/DEMO-SUPPORT-1/replies';
  const input=operation==='create'?{conversationType:'SUPPORT',openingText:'synthetic original',clientMessageId:'saved-open'}
    :{body:'synthetic original',clientMessageId:'saved-reply'};
  const result=await send(path,input);
  assert.equal(result.status,200);
  return {state,path,input,id:result.body.data.messages.at(-1).id};
}

for(const operation of ['create','reply']) {
  test(`[PREVIEW-R18-P2-01] cold ${operation} replay checks the original payload through repeated restores`,async()=>{
    const fixture=await committedCommand(operation);
    let serialized=JSON.stringify(fixture.state);
    const changed={...fixture.input,[operation==='create'?'openingText':'body']:'synthetic changed'};
    for(let restart=0;restart<3;restart++) {
      const state=JSON.parse(serialized),send=commands(state);
      // A cold conflict must be checked before any successful replay primes the transport Map.
      assert.equal((await send(fixture.path,changed)).status,409);
      assert.equal(JSON.stringify(state),serialized);
      const replay=await send(fixture.path,fixture.input);
      assert.equal(replay.status,200);
      assert.equal(replay.body.data.messages.at(-1).id,fixture.id);
      assert.equal(JSON.stringify(state),serialized);
      serialized=JSON.stringify(state);
    }
  });
}

for(const change of ['create-to-reply','reply-to-create','reply-target','create-type']) {
  test(`[PREVIEW-R18-P2-01] a restored key rejects ${change}`,async()=>{
    const fixture=await committedCommand(change.startsWith('create')?'create':'reply');
    if(change==='reply-target')create(fixture.state,'other-conversation');
    const serialized=JSON.stringify(fixture.state),state=JSON.parse(serialized);
    const path=change==='create-to-reply'?'/conversations/DEMO-SUPPORT-1/replies'
      :change==='reply-target'?'/conversations/DEMO-SUPPORT-2/replies':'/conversations';
    const input=path.endsWith('/replies')?{body:'synthetic original',clientMessageId:fixture.input.clientMessageId}
      :{openingText:'synthetic original',conversationType:change==='create-type'?'ADVISOR':'SUPPORT',clientMessageId:fixture.input.clientMessageId};
    const send=commands(state);
    assert.equal((await send(path,input)).status,409);
    assert.equal((await send(fixture.path,fixture.input)).status,200);
    assert.equal(JSON.stringify(state),serialized);
  });
}

test('[PREVIEW-R18-P2-01] different keys may send the same text to different conversations',async()=>{
  const state={};create(state,'other-conversation');
  const send=commands(state),ids=[];
  for(const no of ['DEMO-SUPPORT-1','DEMO-SUPPORT-2']) {
    const result=await send(`/conversations/${no}/replies`,{body:'same synthetic text',clientMessageId:'key-'+no});
    assert.equal(result.status,200);ids.push(result.body.data.messages.at(-1).id);
  }
  assert.notEqual(ids[0],ids[1]);assertGlobalIds(state);
  const restored=JSON.parse(JSON.stringify(state)),replay=commands(restored);
  for(const [index,no] of ['DEMO-SUPPORT-1','DEMO-SUPPORT-2'].entries()) {
    const result=await replay(`/conversations/${no}/replies`,{body:'same synthetic text',clientMessageId:'key-'+no});
    assert.equal(result.status,200);assert.equal(result.body.data.messages.at(-1).id,ids[index]);
  }
});

for(const operation of ['create','reply']) {
  test(`[PREVIEW-R18-P2-01] recovers a legacy ${operation} without a saved fingerprint`,async()=>{
    const fixture=await committedCommand(operation),state=JSON.parse(JSON.stringify(fixture.state));
    delete state.supportMessageCommands;
    if(operation==='create')delete state.supportConversations[0].messages[0].clientMessageId;
    const before=structuredClone(state.supportConversations);
    request(state,'/conversations/cursor');
    const restored=JSON.parse(JSON.stringify(state));
    const changed={...fixture.input,[operation==='create'?'openingText':'body']:'synthetic changed'};
    const send=commands(restored);
    assert.equal((await send(fixture.path,changed)).status,409);
    const result=await send(fixture.path,fixture.input);
    assert.equal(result.status,200);assert.equal(result.body.data.messages.at(-1).id,fixture.id);
    assert.deepEqual(restored.supportConversations,before);
  });
}

test('[PREVIEW-R18-P2-01] retains a completed fingerprint when a fixture replaces its original messages',async()=>{
  const fixture=await committedCommand('create');
  fixture.state.messageState='history';request(fixture.state,'/conversations/cursor');
  const serialized=JSON.stringify(fixture.state),state=JSON.parse(serialized);
  assert.equal((await commands(state)(fixture.path,{...fixture.input,openingText:'synthetic changed'})).status,409);
  assert.equal(JSON.stringify(state),serialized);
});

test('[PREVIEW-R18-P2-01] rejects an unverifiable legacy opening without inventing its original payload',async()=>{
  const fixture=await committedCommand('create');
  fixture.state.messageState='history';request(fixture.state,'/conversations/cursor');
  delete fixture.state.supportMessageCommands;
  const state=JSON.parse(JSON.stringify(fixture.state)),before=structuredClone(state.supportConversations);
  assert.equal((await commands(state)(fixture.path,fixture.input)).status,409);
  assert.deepEqual(state.supportConversations,before);
});

test('[PREVIEW-R18-P2-01] rejects legacy keys used by multiple conversations while preserving both histories',async()=>{
  const state={};create(state,'other-conversation');
  for(const no of ['DEMO-SUPPORT-1','DEMO-SUPPORT-2']) {
    reply(state,no,'unique-'+no);
    const detail=state.supportConversations.find(row=>row.conversation.conversationNo===no);
    detail.messages.at(-1).clientMessageId='ambiguous-key';
    detail.messages.at(-1).content='same synthetic text';
  }
  delete state.supportMessageCommands;
  const before=structuredClone(state.supportConversations);
  for(const no of ['DEMO-SUPPORT-1','DEMO-SUPPORT-2']) {
    assert.equal((await commands(state)(`/conversations/${no}/replies`,{body:'same synthetic text',clientMessageId:'ambiguous-key'})).status,409);
  }
  assert.deepEqual(state.supportConversations,before);
});

test('[PREVIEW-R18-P2-01] does not mistake a later legacy reply for the unkeyed opening',async()=>{
  const fixture=await committedCommand('create'),detail=fixture.state.supportConversations[0];
  delete detail.messages[0].clientMessageId;
  reply(fixture.state,detail.conversation.conversationNo,'later-key');
  detail.messages.at(-1).clientMessageId=fixture.input.clientMessageId;
  delete fixture.state.supportMessageCommands;
  const state=JSON.parse(JSON.stringify(fixture.state)),before=structuredClone(state.supportConversations);
  for(const openingText of [fixture.input.openingText,'later-key']) {
    assert.equal((await commands(state)(fixture.path,{...fixture.input,openingText})).status,409);
  }
  assert.deepEqual(state.supportConversations,before);
});

test('[PREVIEW-R18-P2-01] a settled conflict cannot evict a newer original receipt after reset',async()=>{
  const fixture=await committedCommand('create'),state=JSON.parse(JSON.stringify(fixture.state));
  const transport=createPrototypeMessages({state,fixtureFor:(url,request)=>supportDemo(url,'zh',state,request)});
  const send=input=>transport.request(new URL(root+fixture.path,'http://127.0.0.1'),{
    method:()=> 'POST',headers:()=>({'idempotency-key':input.clientMessageId}),postDataJSON:()=>input,
  });
  const changed={...fixture.input,openingText:'synthetic changed'};
  const first=send(changed),duplicate=send(changed);
  // Only the synthetic transport Map resets; no server or user state is involved.
  transport.reset();
  const original=send(fixture.input);
  assert.deepEqual((await Promise.all([first,duplicate,original])).map(result=>result.status),[409,409,200]);
  const readback=await transport.request(new URL(root+'/commands/'+fixture.input.clientMessageId,'http://127.0.0.1'),{method:()=> 'GET'});
  assert.equal(readback.body.data.result.messages[0].id,fixture.id);
  assert.equal((await send(changed)).status,409);
  assert.equal((await send(fixture.input)).body.data.messages[0].id,fixture.id);
});

test('[PREVIEW-R18-P2-01] conflict cleanup preserves UNKNOWN until an original-key retry confirms it',async()=>{
  const fixture=await committedCommand('create'),state=JSON.parse(JSON.stringify(fixture.state));
  state.messageSendState='unknown';
  const saved=JSON.stringify(state);
  const transport=createPrototypeMessages({state,fixtureFor:(url,request)=>supportDemo(url,'zh',state,request)});
  const send=input=>transport.request(new URL(root+fixture.path,'http://127.0.0.1'),{
    method:()=> 'POST',headers:()=>({'idempotency-key':input.clientMessageId}),postDataJSON:()=>input,
  });
  const readback=()=>transport.request(new URL(root+'/commands/'+fixture.input.clientMessageId,'http://127.0.0.1'),{method:()=> 'GET'});
  const changed={...fixture.input,openingText:'synthetic changed'};
  assert.equal((await send(changed)).status,409);
  assert.equal((await send(fixture.input)).status,504);
  assert.equal((await send(changed)).status,409);
  assert.equal((await readback()).body.data,null);
  assert.equal((await send(fixture.input)).status,200);
  assert.equal((await readback()).body.data.result.messages[0].id,fixture.id);
  assert.equal(JSON.stringify(state),saved);
});
