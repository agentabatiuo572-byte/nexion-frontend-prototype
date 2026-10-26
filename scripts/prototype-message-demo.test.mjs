import test from 'node:test';
import assert from 'node:assert/strict';
import { supportDemo } from './lib/prototype-demo-support.mjs';
import './lib/prototype-demo-support.test.mjs';
const read=(state,path='/api/app/support/conversations/DEMO-SUPPORT-1')=>supportDemo(new URL(path,'http://127.0.0.1'),'zh',state,{method:()=> 'GET'});
test('receipt scenarios supply explicit both-side states and retain missing/system receipts',()=>{
  const state={messageState:'receipts'},first=read(state);
  assert.deepEqual(first.messages.map(m=>[m.senderType,m.receiptStatus]),[['agent','read'],['user','read'],['agent','sent'],['system',undefined],['agent',undefined],['user','sent']]);
  assert.equal(read(state).messages.length,6);
  state.messageState='incoming';const incoming=read(state);
  assert.equal(incoming.messages.length,7);assert.equal(incoming.messages.at(-1).senderType,'agent');
  assert.equal(incoming.messages.at(-2).receiptStatus,'read');
  assert.equal(read(state).messages.length,7);
});
test('badge scenarios keep the full authoritative count and support read-back',()=>{
  const state={messageState:'long-count'};
  assert.equal(read(state).conversation.unreadCount,1298);
  state.messageState='read';assert.equal(read(state).conversation.unreadCount,0);
  state.messageState='normal';assert.equal(read(state).conversation.unreadCount,1);
});
test('history pages have decreasing cursors without overlaps and include image and SKU content',()=>{
  const state={messageState:'history'},first=read(state);
  assert.equal(first.messages.length,8);assert.equal(first.nextCursor,17);
  assert.ok(first.messages.some(m=>m.kind==='IMAGE'));assert.ok(first.messages.some(m=>m.kind==='SKU'));
  const second=read(state,'/api/app/support/conversations/DEMO-SUPPORT-1?beforeMessageId=17');
  const third=read(state,'/api/app/support/conversations/DEMO-SUPPORT-1?beforeMessageId=9');
  assert.equal(second.nextCursor,9);assert.equal(third.nextCursor,null);
  assert.equal(new Set([...third.messages,...second.messages,...first.messages].map(m=>m.id)).size,24);
});
test('timeline fixture exposes a 24-hour boundary plus short gaps and a midnight crossing that stay compact',()=>{
  const state={messageState:'timeline'},first=read(state);
  assert.equal(new Date(first.messages[2].createdAt)-new Date(first.messages[1].createdAt),300000);
  assert.equal(new Date(first.messages[7].createdAt)-new Date(first.messages[6].createdAt),86400000);
  const previous=read(state,'/api/app/support/conversations/DEMO-SUPPORT-1?beforeMessageId=17');
  assert.equal(new Date(first.messages[0].createdAt)-new Date(previous.messages.at(-1).createdAt),120000);
  assert.notEqual(new Date(first.messages[0].createdAt).getDate(),new Date(previous.messages.at(-1).createdAt).getDate());
  const oldest=read(state,'/api/app/support/conversations/DEMO-SUPPORT-1?beforeMessageId=9');
  assert.equal(new Date(previous.messages[0].createdAt)-new Date(oldest.messages.at(-1).createdAt),86399999);
  assert.equal(first.nextCursor,17);assert.equal(previous.nextCursor,9);
});
