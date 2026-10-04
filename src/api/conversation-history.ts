import type { Conversation } from '../domain/support';
/** Preserve loaded history and monotonically merge durable message receipts by database id. */
export function mergeConversationMessages(prior:Conversation|undefined,next:Conversation):Conversation {
  if(!prior?.messages.length)return next;
  const messages=new Map(prior.messages.map(m=>[m.id,m]));
  for(const m of next.messages){const old=messages.get(m.id);messages.set(m.id,old?.status==='read'?{...m,status:'read'}:m);}
  const keptOlder=Number(prior.messages[0].id)<Number(next.messages[0]?.id??Infinity);
  return {...next,messages:[...messages.values()].sort((a,b)=>Number(a.id)-Number(b.id)),
    historyTruncated:keptOlder?prior.historyTruncated:next.historyTruncated,
    historyNextCursor:keptOlder?prior.historyNextCursor:next.historyNextCursor};
}
export async function catchUpConversation(next:Conversation,prior:Conversation|undefined,
  fetchPage:(id:string,before:number)=>Promise<Conversation>,active:()=>boolean):Promise<Conversation> {
  const last=Number(prior?.messages[prior.messages.length-1]?.id??0);
  if(!last)return next;
  // Invalidation events carry no read watermark. Re-read loaded, unconfirmed
  // receipts even when there is no message gap beyond the latest window.
  const receiptFloor=prior?.messages.reduce((floor,message)=>
    message.sender!=='system'&&message.status!=='read'
      ? Math.min(floor,Number(message.id)) : floor,last)??last;
  let page=next;
  const seen=new Set<number>();
  while(page.messages.length&&Number(page.messages[0].id)>receiptFloor&&page.historyNextCursor){
    if(!active())throw new Error('SUPPORT_ACCOUNT_SCOPE_CHANGED');
    const cursor=page.historyNextCursor;
    if(seen.has(cursor))throw new Error('SUPPORT_HISTORY_CURSOR_STALLED');seen.add(cursor);
    page=await fetchPage(next.id,cursor);
    next={...next,messages:[...page.messages,...next.messages],historyTruncated:page.historyTruncated,historyNextCursor:page.historyNextCursor};
  }
  if(!active())throw new Error('SUPPORT_ACCOUNT_SCOPE_CHANGED');
  return mergeConversationMessages(prior,next);
}
