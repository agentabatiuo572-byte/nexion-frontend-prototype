// Preview-only delivery scenarios. Both HTTP and WS execute the existing demoFixture.
import { setTimeout as delay } from 'node:timers/promises';

const root='/api/app/support';
const commandPath=/^\/api\/app\/support\/conversations(?:\/(DEMO-SUPPORT-\d+)\/(replies|read))?$/;
const receiptPath=/^\/api\/app\/support\/commands\/([^/]+)$/;
const ok=data=>({status:200,body:{code:0,message:'OK',data}});
const fail=(status,message)=>({status,body:{code:status,message,data:null}});

export function createPrototypeMessages({state,fixtureFor}) {
  const receipts=new Map();
  let generation=0;
  const matches=(url,method)=>method==='POST'&&commandPath.test(url.pathname)||method==='GET'&&receiptPath.test(url.pathname);
  return {
    matches,
    reset(){generation++;receipts.clear();},
    async request(url,request) {
      const receipt=receiptPath.exec(url.pathname);
      if(receipt&&request.method()==='GET') {
        const saved=receipts.get(decodeURIComponent(receipt[1]));
        if(saved?.scenario==='timeout'&&!saved.result)await delay(4000);
        // Keep the uncertain outcome visible until an explicit retry of the original command.
        return ok(saved?.result&&!saved.hidden?{resultType:'CONVERSATION',result:structuredClone(saved.result)}:null);
      }
      const match=commandPath.exec(url.pathname);
      if(!match||request.method()!=='POST')return fail(422,'该演示操作尚未配置');
      const operation=match[2]==='read'?'read':match[2]==='replies'?'reply':'create';
      const input=request.postDataJSON();
      if(!input||typeof input!=='object'||Array.isArray(input))return fail(400,'消息请求无效');
      if(operation!=='read'&&(input.attachmentId||input.kind&&input.kind!=='TEXT'))return fail(422,'演示暂不上传附件');
      if(operation==='create'&&!['SUPPORT','ADVISOR'].includes(input.conversationType))return fail(422,'该会话类型尚未配置');
      const content=operation==='create'?input.openingText:input.body;
      if(operation!=='read'&&(typeof content!=='string'||!content.trim()))return fail(400,'请输入消息内容');
      if(operation==='read'&&(!Number.isSafeInteger(input.lastSeenMessageId)||input.lastSeenMessageId<1))return fail(400,'消息读取位置无效');
      const headers=request.headers?.()||{};
      const key=headers['idempotency-key']||headers['Idempotency-Key'];
      if(operation!=='read'&&(typeof key!=='string'||!key||input.clientMessageId!==key))return fail(400,'消息请求标识无效');
      // Versions can change during recovery; the original content and target cannot.
      const fingerprint=JSON.stringify([operation,match[1],input.conversationType,content,input.kind||'TEXT']);
      if(operation!=='read'&&receipts.has(key)) {
        const saved=receipts.get(key);
        if(saved.fingerprint!==fingerprint)return fail(409,'消息请求标识已被使用');
        await saved.pending;
        saved.hidden=false;
        return structuredClone(saved.response);
      }
      const saved={fingerprint,scenario:state.messageSendState,hidden:operation!=='read'&&['unknown','timeout'].includes(state.messageSendState)};
      const epoch=generation,scenario=state.messageSendState||'normal';
      const execute=async()=>{
        if(operation!=='read'&&scenario==='delayed')await delay(2000);
        if(operation!=='read'&&scenario==='timeout')await delay(20000);
        if(epoch!==generation)return fail(503,'演示场景已重置，请重试');
        if(operation!=='read'&&scenario==='failed')return fail(422,'消息未发送，请重试');
        // Initialize the same fixture and reject unknown targets before any business write.
        try {
          fixtureFor(new URL(root+'/conversations/cursor',url),{method:()=> 'GET'});
          if(match[1]&&!state.supportConversations?.some(row=>row.conversation.conversationNo===match[1]))return fail(404,'演示会话不存在');
          const result=fixtureFor(url,request);
          if(!result?.conversation||!Array.isArray(result.messages))return fail(422,'该演示操作尚未配置');
          saved.result=structuredClone(result);
          return ok(result);
        } catch(error) {return fail(error.status||500,error.message);}
      };
      if(operation!=='read')receipts.set(key,saved);
      saved.pending=execute().then(response=>{
        saved.response=structuredClone(response);
        // A restored fixture may reject this payload while the original key remains replayable.
        if(response.status===409&&receipts.get(key)===saved)receipts.delete(key);
      });
      await saved.pending;
      if(operation!=='read'&&scenario==='unknown'&&saved.response.status===200) {
        saved.hidden=true;
        // A lost acknowledgement leaves the client uncertain despite the saved result.
        return {...fail(504,'发送结果待确认，请重试原消息'),deliveryUnknown:true};
      }
      return structuredClone(saved.response);
    },
  };
}
