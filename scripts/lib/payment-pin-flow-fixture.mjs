// Frontend acceptance fixture only. Never imported by src or shipped in the production bundle.
import { fixture as reviewFixture } from './design-review-fixture.mjs';

// Synthetic SMS code for the local harness only; it is never included in an API response or product UI.
export const paymentPinFixtureOtp = '012345';

export function createPaymentPinFlowFixture({ now = Date.now } = {}) {
  const orders = new Map(), quotes = new Map(), commands = new Map(), challenges = new Map(), proofs = new Map();
  const state = { loggedIn:false, password:null, version:0, balance:10000, attempts:5, lockedUntil:null, payWrites:0, setupWrites:0, dropNextPayment:false };
  let challengeSequence = 0, proofSequence = 0;
  const proof={serverCanonical:true,sourceEnvironment:'PRODUCTION',runId:''};
  const ok=data=>({status:200,message:'OK',data});
  const fail=(status,message,data=null)=>({status,message,data});
  const pinState=()=>{
    if(state.lockedUntil!==null&&Date.parse(state.lockedUntil)<=now()){state.lockedUntil=null;state.attempts=5;}
    return {configured:state.password!==null,credentialVersion:state.version,lockedUntil:state.lockedUntil,remainingAttempts:state.attempts,serverTime:new Date(now()).toISOString()};
  };
  const wrongPassword=()=>{
    state.attempts=Math.max(0,state.attempts-1);
    // A short lock keeps the local preview testable; this is not a production lock policy.
    if(state.attempts===0)state.lockedUntil=new Date(now()+30000).toISOString();
    return state.lockedUntil===null?'PAYMENT_PASSWORD_INCORRECT':'PAYMENT_PASSWORD_LOCKED';
  };
  const session=()=>({accessToken:'payment-flow-fixture',refreshToken:null,tokenType:'Bearer',user:{userId:90211,countryCode:'+86',phone:'13800138001',nickname:'Frontend acceptance',onboardingComplete:true}});
  function handle(url, request) {
    const method=request.method(), body=request.postDataJSON?.()??{}, path=url.pathname, key=request.headers()['idempotency-key'];
    if(path==='/auth/users/login'){state.loggedIn=true;return ok(session());}
    if(path==='/auth/users/refresh')return state.loggedIn?ok(session()):fail(401,'USER_REFRESH_TOKEN_REQUIRED');
    if(path==='/api/legal/terms/current')return ok({source:'server',sourceEnvironment:'PRODUCTION',runId:'',requestedLocale:url.searchParams.get('locale')||'zh-CN',resolvedLocale:'zh-CN',requestedJurisdiction:'GLOBAL',resolvedJurisdiction:'GLOBAL',provenance:'frontend-acceptance',version:'v1',effectiveAt:'2026-09-02T00:00:00Z',title:'Terms',summary:'Accepted',sections:[{key:'main',title:'Terms',body:'Accepted',sortOrder:0}],acknowledged:true,acknowledgedAt:'2026-09-02T00:00:00Z'});
    const pin='/api/app/security/payment-password';
    if(path===pin)return ok(pinState());
    if([pin+'/setup',pin+'/change',pin+'/reset'].includes(path)){
      if(method!=='POST')return fail(405,'METHOD_NOT_ALLOWED');
      if(typeof key!=='string'||!key)return fail(422,'IDEMPOTENCY_KEY_REQUIRED');
      const prior=commands.get('security:'+key);
      if(prior)return prior.status==='REJECTED'?fail(prior.code,prior.message,prior.state):ok(prior);
      const reject=(status,message)=>{
        const current=pinState();
        commands.set('security:'+key,{commandKey:key,status:'REJECTED',state:current,code:status,message,canResumeSameKey:false});
        return fail(status,message,current);
      };
      const operation=path.split('/').at(-1), current=pinState();
      if(operation==='setup'&&current.configured)return reject(409,'PAYMENT_PASSWORD_ALREADY_CONFIGURED');
      if(operation!=='setup'&&!current.configured)return reject(409,'PAYMENT_PASSWORD_NOT_CONFIGURED');
      if(operation!=='setup'&&body.expectedCredentialVersion!==state.version)return reject(409,'PAYMENT_PASSWORD_VERSION_CONFLICT');
      if(operation==='change'){
        if(current.lockedUntil!==null)return reject(423,'PAYMENT_PASSWORD_LOCKED');
        if(body.currentPassword!==state.password)return reject(422,wrongPassword());
      }
      const resetProof=operation==='reset'?proofs.get(body.resetProof):null;
      if(operation==='reset'&&(!resetProof||resetProof.expiresAt<=now()||resetProof.version!==state.version))return reject(422,'PAYMENT_PASSWORD_PROOF_EXPIRED');
      if(typeof body.newPassword!=='string'||!/^[0-9]{6}$/.test(body.newPassword)||body.newPassword!==body.confirmPassword)return reject(422,'PAYMENT_PASSWORD_CONFIRM_MISMATCH');
      if(/^(.)\1{5}$/.test(body.newPassword)||'0123456789012345'.includes(body.newPassword)||'9876543210987654'.includes(body.newPassword))return reject(422,'PAYMENT_PASSWORD_TOO_SIMPLE');
      if(operation!=='setup'&&body.newPassword===state.password)return reject(422,'PAYMENT_PASSWORD_NEW_MUST_DIFFER');
      if(operation==='reset')proofs.delete(body.resetProof);
      state.password=body.newPassword;state.version++;state.attempts=5;state.lockedUntil=null;
      if(operation==='setup')state.setupWrites++;
      const receipt={commandKey:key,status:'SUCCEEDED',state:pinState(),canResumeSameKey:false};commands.set('security:'+key,receipt);return ok(receipt);
    }
    if(path===pin+'/reset/challenge'){
      if(method!=='POST')return fail(405,'METHOD_NOT_ALLOWED');
      if(!pinState().configured)return fail(409,'PAYMENT_PASSWORD_NOT_CONFIGURED');
      if(Object.keys(body).length!==0)return fail(422,'PAYMENT_PASSWORD_CHALLENGE_INVALID');
      const challengeNo='pin-fixture-challenge-'+(++challengeSequence), expiresAt=now()+600000;
      challenges.clear();challenges.set(challengeNo,{expiresAt,version:state.version});
      return ok({phoneMasked:'+86 *** 8001',challengeNo,resendAfterSec:60,expiresAt:new Date(expiresAt).toISOString()});
    }
    if(path===pin+'/reset/verify'){
      if(method!=='POST')return fail(405,'METHOD_NOT_ALLOWED');
      const challenge=challenges.get(body.challengeNo);
      if(!challenge||challenge.expiresAt<=now()||challenge.version!==state.version)return fail(422,'PAYMENT_PASSWORD_CHALLENGE_EXPIRED');
      if(body.code!==paymentPinFixtureOtp)return fail(422,'PAYMENT_PASSWORD_CODE_INVALID');
      challenges.delete(body.challengeNo);
      const resetProof='pin-fixture-proof-'+(++proofSequence), expiresAt=now()+600000;
      proofs.set(resetProof,{expiresAt,version:state.version});
      return ok({resetProof,expiresAt:new Date(expiresAt).toISOString()});
    }
    if(path.startsWith(pin+'/commands/'))return ok(commands.get('security:'+decodeURIComponent(path.split('/').at(-1)))??{commandKey:decodeURIComponent(path.split('/').at(-1)),status:'NOT_SEEN',canResumeSameKey:false});
    if(path==='/api/orders/quote'){
      const quote=reviewFixture(url,'zh',{},request);quote.quoteId='pin-quote-'+(quotes.size+1);quote.quoteHash=quote.quoteId;
      quotes.set(quote.quoteId,quote);return ok(quote);
    }
    if((path==='/api/orders'||path==='/api/orders/bundle')&&method==='POST'){
      const quote=quotes.get(body.promotionQuoteId);if(!quote)return fail(422,'QUOTE_REQUIRED');
      quote.quantity=quote.items.reduce((total,item)=>total+item.quantity,0);
      const now=Date.now(), orderNo='PIN-FLOW-'+(orders.size+1), amount=Number(quote.amountUsdt);
      const order={orderNo,productId:1,productNo:quote.items[0].productNo,productName:'UVEL Box S1',quantity:quote.quantity,subtotalUsdt:Number(quote.subtotalUsdt),unitPriceUsdt:1299,discountUsdt:0,amountUsdt:quote.amountUsdt,promotionQuoteId:quote.quoteId,paymentMethod:'WALLET',paymentStatus:'PENDING',orderStatus:'PENDING_PAYMENT',activationStatus:'WAITING_PAYMENT',canonicalStatus:'placed',orderType:quote.items.length>1?'BUNDLE':'SINGLE',placedAt:now,expiresAt:now+300000,paidAt:null,activatedAt:null,refundedAt:null,refundAmountUsdt:null,refundChannel:null,refundBillNo:null,dataCenter:null,tradeinNo:null,sourceDeviceId:null,targetDeviceId:null,targetDeviceInstanceNo:null,itemCount:quote.itemCount,payBy:new Date(now+300000).toISOString(),rewards:[],items:quote.items.map((item,i)=>({...item,lineId:'pin-line-'+i,productName:'UVEL Box S1'})),lineItems:null};
      orders.set(orderNo,order);return ok(order);
    }
    const pay=path.match(/^\/api\/orders\/([^/]+)\/pay$/);
    if(pay&&method==='POST'){
      const order=orders.get(decodeURIComponent(pay[1]));if(!order)return fail(404,'ORDER_NOT_FOUND');
      if(order.paymentStatus==='PAID')return ok(order);
      const current=pinState();
      if(!current.configured)return fail(409,'PAYMENT_PASSWORD_NOT_CONFIGURED',current);
      if(current.lockedUntil!==null)return fail(423,'PAYMENT_PASSWORD_LOCKED',current);
      if(body.credentialVersion!==state.version)return fail(409,'PAYMENT_PASSWORD_VERSION_CONFLICT',current);
      if(body.paymentPassword!==state.password)return fail(422,wrongPassword(),pinState());
      state.attempts=5;
      state.payWrites++;state.balance-=Number(order.amountUsdt);
      Object.assign(order,{paymentStatus:'PAID',orderStatus:'COMPLETED',activationStatus:'ACTIVATED',canonicalStatus:'activated',paidAt:Date.now(),activatedAt:Date.now(),targetDeviceId:90301,targetDeviceInstanceNo:'PIN-FLOW-DEVICE',paymentNo:'PIN-FLOW-PAYMENT'});
      commands.set('order-pay:'+key,{kind:'order-pay',commandKey:key,status:'SUCCEEDED',canResumeSameKey:false,receipt:order});
      return {...ok(order),drop:state.dropNextPayment?(state.dropNextPayment=false,true):false};
    }
    if(path==='/api/orders')return ok({...proof,runId:null,source:'server',orders:[...orders.values()],nextCursor:null});
    if(path.startsWith('/api/app/payment-commands/')){
      const [,kind,commandKey]=path.match(/^\/api\/app\/payment-commands\/([^/]+)\/(.+)$/)??[];
      return ok(commands.get(kind+':'+decodeURIComponent(commandKey))??{kind,commandKey:decodeURIComponent(commandKey),status:'NOT_SEEN',canResumeSameKey:true});
    }
    if(path.startsWith('/api/promotion-commands/')){
      const commandKey=decodeURIComponent(path.split('/').at(-1)), original=commands.get('order-pay:'+commandKey);
      return ok({commandId:commandKey,operation:url.searchParams.get('operation'),targetId:url.searchParams.get('targetId'),idempotencyKey:commandKey,status:original?'SUCCEEDED':'NOT_FOUND',resource:null,order:original?.receipt??null,error:null});
    }
    const data=reviewFixture(url,'zh',{offers:false,promotions:false},request);
    if(path==='/api/store/catalog')return ok({...data,products:data.products.map(product=>({...product,imageUrl:new URL(new URL(product.imageUrl).pathname,url.origin).href}))});
    if(path==='/api/devices/earnings')return ok({...data,walletUsdt:state.balance});
    if(path==='/api/app/trade-in/capacity-quote')return ok({...data,walletBalanceUsdt:state.balance,sufficientFunds:true});
    if(path==='/api/trial/state'||path==='/api/trial/eligibility')return ok({...data,canStart:false,reason:'used',state:'ELIGIBLE',version:1});
    return ok(data??{});
  }
  return {handle,state,orders};
}
