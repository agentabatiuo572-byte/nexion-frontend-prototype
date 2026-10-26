// Local-only conversation samples; no message leaves the preview server.
import { createHash } from 'node:crypto';

// Match the live preview transport's intent tuple; versions are deliberately excluded.
const commandFingerprint=(operation,target,input)=>createHash('sha256').update(JSON.stringify([
  operation,target,input.conversationType,operation==='create'?input.openingText:input.body,input.kind||'TEXT',
])).digest('hex');
function restoreMessageCommands(state) {
  state.supportMessageCommands??=[];
  const known=new Set(state.supportMessageCommands.map(command=>command.key)),recovered=new Map();
  const remember=(key,fingerprint,detail)=>{
    if(typeof key!=='string'||!key||known.has(key))return;
    // Multiple legacy owners cannot authorize replay to either conversation.
    recovered.set(key,{key,fingerprint:recovered.has(key)?null:fingerprint,conversationNo:detail.conversation.conversationNo});
  };
  const isText=message=>message?.senderType==='user'&&typeof message.content==='string'
    &&(!message.kind||message.kind==='TEXT')&&!message.attachmentId;
  for(const detail of state.supportConversations) {
    const openingKey=detail.clientMessageId;
    if(openingKey) {
      const matches=detail.messages.filter(message=>message.clientMessageId===openingKey);
      // Older exports omitted the opening message's clientMessageId. Only a full
      // history beginning with an unkeyed user message can prove that original body.
      const first=detail.messages[0];
      const opening=!detail.historyTruncated&&(matches.length===1&&matches[0]===first
        ||matches.length===0&&first?.clientMessageId==null)?first:undefined;
      const conversationType=detail.conversation.conversationType?.toUpperCase();
      remember(openingKey,isText(opening)&&['SUPPORT','ADVISOR'].includes(conversationType)
        ?commandFingerprint('create',undefined,{conversationType,openingText:opening.content,kind:opening.kind}):null,detail);
    }
    for(const message of detail.messages) {
      if(message.senderType!=='user'||message.clientMessageId===openingKey)continue;
      remember(message.clientMessageId,isText(message)
        ?commandFingerprint('reply',detail.conversation.conversationNo,{body:message.content,kind:message.kind}):null,detail);
    }
  }
  state.supportMessageCommands.push(...recovered.values());
}
function replayCommand(state,key,fingerprint) {
  const saved=state.supportMessageCommands.find(command=>command.key===key);
  if(!saved)return;
  const detail=state.supportConversations.find(row=>row.conversation.conversationNo===saved.conversationNo);
  if(!saved.fingerprint||saved.fingerprint!==fingerprint||!detail)
    throw Object.assign(new Error('消息请求标识已被使用'),{status:409});
  return detail;
}

function prepareMessageIds(state) {
  // nx_conversation_message.id is a table-wide AUTO_INCREMENT primary key.
  // Keep the high-water mark in exported state even when a scenario replaces messages.
  let sequence=state.supportMessageSequence||0;
  for(const detail of state.supportConversations) {
    sequence=Math.max(sequence,detail.conversation.lastPublicMessageId||0,detail.nextCursor||0);
    for(const message of detail.messages)sequence=Math.max(sequence,message.id);
  }
  for(const marker of state.supportDismissals||[])sequence=Math.max(sequence,marker.throughMessageId);
  state.supportMessageSequence=sequence;
  const nextId=()=>++state.supportMessageSequence;
  const used=new Set();
  // Legacy exports used IDs local to each conversation. Keep the oldest owner's IDs;
  // move a colliding message and any following lower IDs together to preserve cursors.
  for(const detail of [...state.supportConversations].sort((a,b)=>a.conversation.id-b.conversation.id)) {
    const remapped=new Map();
    let previous=0;
    for(const message of detail.messages) {
      const oldId=message.id;
      if(used.has(oldId)||oldId<=previous) {
        message.id=nextId();
        remapped.set(oldId,message.id);
      }
      used.add(message.id);
      previous=message.id;
    }
    // A saved boundary can outlive its exact message after a scenario replacement.
    const boundary=(id,exclusive=false)=>{
      let mapped=remapped.get(id)??id;
      if(id!=null)for(const [oldId,newId] of remapped) {
        if(oldId<id||!exclusive&&oldId===id)mapped=Math.max(mapped,newId+(exclusive?1:0));
      }
      return mapped;
    };
    detail.conversation.lastPublicMessageId=boundary(detail.conversation.lastPublicMessageId);
    detail.nextCursor=boundary(detail.nextCursor,true);
    for(const marker of state.supportDismissals||[]) {
      if(marker.conversationNo===detail.conversation.conversationNo)marker.throughMessageId=boundary(marker.throughMessageId);
    }
  }
  return nextId;
}

export function supportDemo(url,locale,state,request) {
  const root='/api/app/support',p=url.pathname;
  if(!p.startsWith(root))return undefined;
  const method=request.method(),input=method==='GET'?{}:request.postDataJSON(),now=new Date().toISOString();
  const text=(zh,en,vi)=>locale==='zh'?zh:locale==='vi'?vi:en;
  if(p===root+'/advisor')return {assignmentId:1,currentAdvisorId:1,currentAdvisorName:text('演示顾问','Demo advisor','Cố vấn mẫu'),assignmentState:'ASSIGNED',availability:'BUSY'};
  if(p===root+'/attachments/policy')return {available:false,allowedMimeTypes:[],maxBytes:null,maxPixels:null,ttlSeconds:null,unavailableReason:text('演示暂不上传附件','Attachments are unavailable in this demo','Bản mẫu chưa hỗ trợ tệp đính kèm')};
  if(p===root+'/conversation-categories')return [{type:'advisor',enabled:true},{type:'support',enabled:true},{type:'ai',enabled:false}];
  const scenario=state.messageState||'normal';
  if(state.supportConversations==null) {
    const content=text('你好，这里是原型演示会话。','Hello, this is a prototype conversation.','Xin chào, đây là hội thoại mẫu.');
    // Replacement scenarios start directly at message 1, retaining their existing pages.
    const messages=['history','timeline','receipts'].includes(scenario)?[]:[{id:1,senderType:'agent',senderName:text('演示客服','Demo support','Hỗ trợ mẫu'),content,createdAt:now}];
    state.supportConversations=[{conversation:{id:1,conversationNo:'DEMO-SUPPORT-1',conversationType:'support',status:'OPEN',version:1,ownerAgentName:text('演示客服','Demo support','Hỗ trợ mẫu'),unreadCount:1,lastMessage:content,lastMessageAt:now,lastPublicMessageId:messages.length},messages,historyTruncated:false,nextCursor:null}];
  }
  const nextMessageId=prepareMessageIds(state);
  // Recover before a user-selected scenario can replace the source messages.
  // Only completed intent hashes are exported; no timers, promises or extra body copies.
  restoreMessageCommands(state);
  // Every receipt here is an explicit server fixture, never inferred by the UI.
  if(state.supportScenario!==scenario) {
    const detail=state.supportConversations[0];
    state.supportHistory=['history','timeline'].includes(scenario)||scenario==='incoming'&&state.supportHistory;
    if(['history','timeline'].includes(scenario)) {
      detail.messages=Array.from({length:24},(_,index)=>({id:nextMessageId(),senderType:index%2?'user':'agent',content:text('第'+(index+1)+'条历史消息。这里保留设备查询与服务沟通的完整内容，方便检查长正文换行。','History message '+(index+1)+'. The full device and service discussion remains available for checking long text wrapping.','Tin nhắn lịch sử '+(index+1)+'. Nội dung đầy đủ về thiết bị và hỗ trợ được giữ lại để kiểm tra văn bản dài.'),createdAt:new Date(Date.now()-(25-index)*60000).toISOString(),receiptStatus:index%2?'read':'sent'}));
      detail.messages[19]={...detail.messages[19],kind:'IMAGE',attachmentId:'demo-image',content:'',senderType:'agent'};
      detail.messages[21]={...detail.messages[21],kind:'SKU',skuId:'stellarbox-s1',skuName:'UVELBox S1',targetAvailability:'AVAILABLE',senderType:'agent',content:'UVELBox S1'};
      if(scenario==='timeline') {
        const today=new Date();today.setHours(0,0,0,0);
        const at=(days,hours,minutes)=>{const date=new Date(today);date.setDate(date.getDate()+days);date.setHours(hours,minutes,0,0);return date.toISOString();};
        const minutes=[1,2,7,9,10,11,16,17];
        detail.messages.forEach((message,index)=>{
          message.createdAt=index<8?at(-3,23,45+index):index<16?at(-2,23,52+index-8):at(-1,0,minutes[index-16]);
        });
        // Keep one adjacent pair 1ms below the threshold as well as the exact
        // 24-hour pair below, so the real preview exposes both boundary cases.
        detail.messages[8].createdAt = new Date(new Date(detail.messages[7].createdAt).getTime() + 86_399_999).toISOString();
        detail.messages[23].createdAt = new Date(new Date(detail.messages[22].createdAt).getTime() + 86_400_000).toISOString();
        const previousYear=new Date(today);previousYear.setFullYear(previousYear.getFullYear()-1,11,31);previousYear.setHours(10,0,0,0);
        detail.messages[0].createdAt=previousYear.toISOString();
      }
      Object.assign(detail.conversation,{unreadCount:2,lastMessage:detail.messages.at(-1).content,lastMessageAt:detail.messages.at(-1).createdAt,lastPublicMessageId:detail.messages.at(-1).id});
    } else if(scenario==='receipts') {
      const samples=[
        ['agent',text('你好，请问需要什么帮助？','Hello, how can I help?','Xin chào, bạn cần hỗ trợ gì?'),'read'],
        ['user',text('请帮我确认设备状态。','Please check my device status.','Vui lòng kiểm tra trạng thái thiết bị.'),'read'],
        ['agent',text('设备运行正常。详细记录可以在设备页面查看。','Your device is running normally. Details are available on the device page.','Thiết bị đang hoạt động bình thường. Bạn có thể xem chi tiết trên trang thiết bị.'),'sent'],
        ['system',text('会话已连接','Conversation connected','Đã kết nối hội thoại'),null],
        ['agent',text('这条消息未提供回执。','No receipt was provided for this message.','Tin nhắn này không có thông tin xác nhận.'),null],
        ['user',text('谢谢，我稍后查看。','Thank you. I will check shortly.','Cảm ơn, tôi sẽ kiểm tra sau.'),'sent'],
      ];
      detail.messages=samples.map(([senderType,content,receiptStatus],index)=>({id:nextMessageId(),senderType,content,createdAt:new Date(Date.now()-(samples.length-index)*60000).toISOString(),...(receiptStatus?{receiptStatus}:{}),...(senderType==='agent'?{senderName:text('演示客服','Demo support','Hỗ trợ mẫu')}:{})}));
      Object.assign(detail.conversation,{unreadCount:2,lastMessage:detail.messages.at(-1).content,lastMessageAt:detail.messages.at(-1).createdAt,lastPublicMessageId:detail.messages.at(-1).id});
    } else if(scenario==='incoming') {
      const lastUser=detail.messages.filter(item=>item.senderType==='user').at(-1);if(lastUser)lastUser.receiptStatus='read';
      const id=nextMessageId();
      const content=text('已收到你的消息，我会继续跟进。','I have received your message and will follow up.','Tôi đã nhận được tin nhắn và sẽ tiếp tục hỗ trợ.');
      detail.messages.push({id,senderType:'agent',senderName:text('演示客服','Demo support','Hỗ trợ mẫu'),content,createdAt:now,receiptStatus:'sent'});
      Object.assign(detail.conversation,{unreadCount:detail.conversation.unreadCount+1,lastMessage:content,lastMessageAt:now,lastPublicMessageId:id});
    } else detail.conversation.unreadCount=scenario==='long-count'?1298:scenario==='read'?0:1;
    detail.conversation.version++;
    state.supportScenario=scenario;
  }
  state.supportDismissals??=[];
  if(p===root+'/conversation-dismissals')return state.supportDismissals;
  if(p===root+'/tickets/cursor')return {records:[],pageSize:100,total:0};
  if(p===root+'/conversations/cursor')return {records:state.dataState==='empty'?[]:state.supportConversations.map(item=>item.conversation),pageSize:100,total:state.dataState==='empty'?0:state.supportConversations.length};
  if(p===root+'/conversations'&&method==='POST') {
    const fingerprint=commandFingerprint('create',undefined,input);
    const existing=replayCommand(state,input.clientMessageId,fingerprint);if(existing)return existing;
    const id=state.supportConversations.length+1,messageId=nextMessageId(),detail={clientMessageId:input.clientMessageId,conversation:{id,conversationNo:'DEMO-SUPPORT-'+id,conversationType:input.conversationType.toLowerCase(),status:'OPEN',version:1,ownerAgentName:'Demo support',unreadCount:0,lastMessage:input.openingText,lastMessageAt:now,lastPublicMessageId:messageId},messages:[{id:messageId,clientMessageId:input.clientMessageId,senderType:'user',content:input.openingText,createdAt:now,receiptStatus:'sent'}],historyTruncated:false,nextCursor:null};
    state.supportConversations.unshift(detail);
    state.supportMessageCommands.push({key:input.clientMessageId,fingerprint,conversationNo:detail.conversation.conversationNo});
    return detail;
  }
  const match=p.match(/^\/api\/app\/support\/conversations\/(DEMO-SUPPORT-\d+)(?:\/(read|replies|dismiss))?$/);
  if(match) {
    const detail=state.supportConversations.find(item=>item.conversation.conversationNo===match[1]);if(!detail)throw new Error('Demo conversation not found');
    if(match[2]==='read')detail.conversation.unreadCount=0;
    if(match[2]==='dismiss') {const marker={conversationNo:match[1],throughMessageId:input.throughMessageId};state.supportDismissals=state.supportDismissals.filter(item=>item.conversationNo!==match[1]).concat(marker);return marker;}
    if(match[2]==='replies') {
      const fingerprint=commandFingerprint('reply',match[1],input);
      if(!replayCommand(state,input.clientMessageId,fingerprint)) {
        const id=nextMessageId();detail.messages.push({id,clientMessageId:input.clientMessageId,senderType:'user',content:input.body,createdAt:now,receiptStatus:'sent'});
        Object.assign(detail.conversation,{version:detail.conversation.version+1,lastMessage:input.body,lastMessageAt:now,lastPublicMessageId:id});
        state.supportMessageCommands.push({key:input.clientMessageId,fingerprint,conversationNo:match[1]});
      }
    }
    const result=structuredClone(detail);
    if(state.supportHistory) {
      const cursor=Number(url.searchParams.get('beforeMessageId'))||Infinity;
      const available=result.messages.filter(item=>item.id<cursor);result.messages=available.slice(-8);
      result.historyTruncated=available.length>8;result.nextCursor=result.historyTruncated?result.messages[0].id:null;
    }
    return result;
  }
}
