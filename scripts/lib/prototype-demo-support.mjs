// Local-only conversation samples; no message leaves the preview server.
export function supportDemo(url,locale,state,request) {
  const root='/api/app/support',p=url.pathname;
  if(!p.startsWith(root))return undefined;
  const method=request.method(),input=method==='GET'?{}:request.postDataJSON(),now=new Date().toISOString();
  const text=(zh,en,vi)=>locale==='zh'?zh:locale==='vi'?vi:en;
  if(p===root+'/advisor')return {assignmentId:1,currentAdvisorId:1,currentAdvisorName:text('演示顾问','Demo advisor','Cố vấn mẫu'),assignmentState:'ASSIGNED',availability:'BUSY'};
  if(p===root+'/attachments/policy')return {available:false,allowedMimeTypes:[],maxBytes:null,maxPixels:null,ttlSeconds:null,unavailableReason:text('演示暂不上传附件','Attachments are unavailable in this demo','Bản mẫu chưa hỗ trợ tệp đính kèm')};
  if(p===root+'/conversation-categories')return [{type:'advisor',enabled:true},{type:'support',enabled:true},{type:'ai',enabled:false}];
  state.supportConversations??=[{conversation:{id:1,conversationNo:'DEMO-SUPPORT-1',conversationType:'support',status:'OPEN',version:1,ownerAgentName:text('演示客服','Demo support','Hỗ trợ mẫu'),unreadCount:1,lastMessage:text('你好，这里是原型演示会话。','Hello, this is a prototype conversation.','Xin chào, đây là hội thoại mẫu.'),lastMessageAt:now,lastPublicMessageId:1},messages:[{id:1,senderType:'agent',senderName:text('演示客服','Demo support','Hỗ trợ mẫu'),content:text('你好，这里是原型演示会话。','Hello, this is a prototype conversation.','Xin chào, đây là hội thoại mẫu.'),createdAt:now}],historyTruncated:false,nextCursor:null}];
  state.supportDismissals??=[];
  if(p===root+'/conversation-dismissals')return state.supportDismissals;
  if(p===root+'/tickets/cursor')return {records:[],pageSize:100,total:0};
  if(p===root+'/conversations/cursor')return {records:state.dataState==='empty'?[]:state.supportConversations.map(item=>item.conversation),pageSize:100,total:state.dataState==='empty'?0:state.supportConversations.length};
  if(p===root+'/conversations'&&method==='POST') {
    const existing=state.supportConversations.find(item=>item.clientMessageId===input.clientMessageId);if(existing)return existing;
    const id=state.supportConversations.length+1,detail={clientMessageId:input.clientMessageId,conversation:{id,conversationNo:'DEMO-SUPPORT-'+id,conversationType:input.conversationType.toLowerCase(),status:'OPEN',version:1,ownerAgentName:'Demo support',unreadCount:0,lastMessage:input.openingText,lastMessageAt:now,lastPublicMessageId:1},messages:[{id:1,senderType:'user',content:input.openingText,createdAt:now,receiptStatus:'sent'}],historyTruncated:false,nextCursor:null};
    state.supportConversations.unshift(detail);return detail;
  }
  const match=p.match(/^\/api\/app\/support\/conversations\/(DEMO-SUPPORT-\d+)(?:\/(read|replies|dismiss))?$/);
  if(match) {
    const detail=state.supportConversations.find(item=>item.conversation.conversationNo===match[1]);if(!detail)throw new Error('Demo conversation not found');
    if(match[2]==='read')detail.conversation.unreadCount=0;
    if(match[2]==='dismiss') {const marker={conversationNo:match[1],throughMessageId:input.throughMessageId};state.supportDismissals=state.supportDismissals.filter(item=>item.conversationNo!==match[1]).concat(marker);return marker;}
    if(match[2]==='replies'&&!detail.messages.some(item=>item.clientMessageId===input.clientMessageId)) {
      const id=detail.messages.length+1;detail.messages.push({id,clientMessageId:input.clientMessageId,senderType:'user',content:input.body,createdAt:now,receiptStatus:'sent'});
      Object.assign(detail.conversation,{version:detail.conversation.version+1,lastMessage:input.body,lastMessageAt:now,lastPublicMessageId:id});
    }
    return structuredClone(detail);
  }
}
