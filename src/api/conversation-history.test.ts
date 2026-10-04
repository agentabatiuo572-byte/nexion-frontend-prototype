import {describe,it,expect} from 'vitest';
import {catchUpConversation,mergeConversationMessages} from './conversation-history';
import type {Conversation} from '../domain/support';
const page=(first:number,last:number):Conversation=>({id:'CV-1',version:1,messages:Array.from({length:last-first+1},(_,i)=>({id:String(first+i),sender:'user' as const,text:'hi',ts:first+i,status:'sent' as const})),historyTruncated:first>1,historyNextCursor:first>1?first:null} as Conversation);
describe('conversation history recovery',()=>{
  it('fills a gap of more than 100 messages without discarding loaded history',async()=>{
    const calls:number[]=[];const result=await catchUpConversation(page(202,301),page(1,1),async(_,before)=>{calls.push(before);return page(Math.max(1,before-100),before-1)},()=>true);
    expect(calls).toEqual([202,102,2]);expect(result.messages).toHaveLength(301);expect(new Set(result.messages.map(m=>m.id)).size).toBe(301);
    expect(result.historyNextCursor).toBe(null);
  });
  it('never regresses a read receipt when a delayed acknowledgement is merged',()=>{
    const prior=page(1,2);prior.messages[1].status='read';const next=mergeConversationMessages(prior,page(2,3));
    expect(next.messages).toHaveLength(3);expect(next.messages[1].status).toBe('read');
  });
  it('abandons catch-up after account or page scope changes',async()=>{
    let active=true;await expect(catchUpConversation(page(202,301),page(1,1),async()=>{active=false;return page(102,201)},()=>active)).rejects.toThrow('SUPPORT_ACCOUNT_SCOPE_CHANGED');
  });
});
