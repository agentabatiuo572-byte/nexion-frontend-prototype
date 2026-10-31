// Local frontend acceptance only. Never imported by src or deployed as a payment service.
import {createPaymentPinFlowFixture} from './payment-pin-flow-fixture.mjs';
import {demoFixture} from './prototype-demo-data.mjs';
import {createPurchasePaymentPreviewFixture} from './purchase-payment-preview-fixture.mjs';

export function createCheckoutFlowFixture(state, locale = () => 'zh') {
  state.checkoutNoPendingReservation = true;
  const pin = createPaymentPinFlowFixture();
  pin.state.loggedIn = true;
  pin.state.balance = state.walletBalance ?? 52800.64;
  const receipts = new Map();
  const ok = data => ({status:200,message:'OK',data});
  const external = createPurchasePaymentPreviewFixture(state, locale);
  const handles = path => /^\/api\/(orders(?:\/|$)|promotion-commands\/|app\/(security\/payment-password|payment-commands\/))/.test(path) || external.handles(path);
  function handle(url, request) {
    const path = url.pathname, method = request.method(), key = request.headers()['idempotency-key'];
    if (path.startsWith('/api/app/security/payment-password') || path.startsWith('/api/app/payment-commands/')) return pin.handle(url, request);
    // Model the server's deadline task in this isolated fixture, not in product code.
    for (const order of state.createdOrders ?? []) {
      if (order.paymentStatus === 'PENDING' && order.expiresAt <= Date.now()) {
        Object.assign(order,{canonicalStatus:'expired',paymentStatus:'EXPIRED',orderStatus:'EXPIRED',activationStatus:'WAITING_PAYMENT',closeReasonCode:'PAYMENT_TIMEOUT'});
      }
    }
    if (external.handles(path)) return external.handle(url, request);
    if (path === '/api/orders' && method === 'GET') return ok(demoFixture(url,locale(),state,request));
    if (path === '/api/orders/quote') return ok(demoFixture(url,locale(),state,request));
    if (['/api/orders','/api/orders/bundle'].includes(path) && method === 'POST') {
      if (receipts.has(path+key)) return ok(receipts.get(path+key));
      const result = demoFixture(url,locale(),state,request);
      const order = state.createdOrders.find(item => item.orderNo === result.orderNo);
      pin.orders.set(order.orderNo,order);
      receipts.set(path+key,result);
      return ok(result);
    }
    const action = path.match(/^\/api\/orders\/([^/]+)\/(pay|cancel)$/);
    if (action && method === 'POST') {
      const orderNo = decodeURIComponent(action[1]);
      let order = state.createdOrders?.find(item => item.orderNo === orderNo);
      if (!order) {
        order = demoFixture(new URL('/api/orders',url.origin),locale(),state,{...request,method:()=> 'GET'}).orders.find(item=>item.orderNo===orderNo);
        if (!order) return {status:404,message:'ORDER_NOT_FOUND',data:null};
        // Seeded order-list rows predate dynamic purchase rows. Normalize their
        // single SKU once when adopting them into the writable fixture store.
        order.lineItems = [{sku:order.productNo,name:order.productName,quantity:order.quantity??1,unitPriceUsdt:order.unitPriceUsdt??order.amountUsdt,lineAmountUsdt:order.subtotalUsdt??order.amountUsdt}];
        state.createdOrders ??= []; state.createdOrders.push(order);
      }
      if (action[2] === 'cancel') return ok(demoFixture(url,locale(),state,request));
      if (!['PENDING','PAID'].includes(order.paymentStatus)) return {status:409,message:'ORDER_PAYMENT_EXPIRED',data:null};
      pin.orders.set(orderNo,order);
      const before = structuredClone(order), beforeBalance = pin.state.balance, beforeWrites = pin.state.payWrites;
      const authorization = pin.handle(url,request);
      if (authorization.status !== 200) return authorization;
      // The PIN fixture validates and records the original authorization; the
      // existing commerce fixture owns stock/capacity/receipt/fleet semantics.
      Object.assign(order,before);
      state.walletBalance = beforeBalance;
      let settled;
      try { settled = demoFixture(url,locale(),state,request); }
      catch (error) {
        pin.state.balance=beforeBalance;pin.state.payWrites=beforeWrites;Object.assign(order,before);
        return {status:error.status??409,message:error.message,data:null};
      }
      pin.state.balance=state.walletBalance;
      Object.assign(order,{paymentNo:settled.paymentNo,targetDeviceId:order.targetDeviceId??90301,targetDeviceInstanceNo:order.targetDeviceInstanceNo??orderNo+'-0-0'});
      return {...ok(settled),drop:authorization.drop};
    }
    return ok(demoFixture(url,locale(),state,request));
  }
  return {handles,handle,pin};
}
