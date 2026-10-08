import type { OrderReceipt, Quote } from '../api/promotion-contracts';
import type { PromotionApi, PromotionOperation } from '../api/promotion-api';

export interface PromotionPendingCommand { key: string; operation: PromotionOperation; targetId: string }
export interface PromotionCheckoutRecord { quote: Quote | null; order: OrderReceipt | null; pending: PromotionPendingCommand | null; voucherId?:string|null }
export function selectPromotionCheckoutRecord(records:Record<string,PromotionCheckoutRecord>,input:{activityId:string;items:{productNo:string;quantity:number}[];orderNo?:string}){
  const requested=input.orderNo?JSON.stringify(['order',input.orderNo]):JSON.stringify([input.activityId,input.items]);
  const pending=Object.entries(records).find(([,record])=>!!record.pending);
  const intent=pending?.[0]??requested;
  return {intent,record:pending?.[1]??records[intent],openedOriginal:!!pending&&intent!==requested};
}
export interface PromotionSessionPorts {
  api: Pick<PromotionApi, 'create' | 'pay' | 'cancel' | 'command' | 'findOrder'>;
  save(record: PromotionCheckoutRecord): void;
  key(intent: string): string;
  current(): boolean;
}
/** One durable original command. Querying never issues or retries a mutation. */
export class PromotionCheckoutSession {
  record: PromotionCheckoutRecord;
  busy = false;
  unknown = false;
  confirmed = false;
  retryOriginal = false;
  constructor(private ports: PromotionSessionPorts, record?: PromotionCheckoutRecord | null) {
    this.record = record ?? { quote: null, order: null, pending: null };
    this.unknown = !!this.record.pending;
  }
  setQuote(quote: Quote,voucherId:string|null=null): void {
    if (this.busy || this.record.pending || this.record.order) throw new Error('ORIGINAL_ORDER_UNRESOLVED');
    this.persist({ quote, order: null, pending: null,voucherId });
    this.confirmed = false;
  }
  invalidateQuote():void {if(this.busy||this.record.pending||this.record.order)throw new Error('ORIGINAL_ORDER_UNRESOLVED');this.persist({quote:null,order:null,pending:null});this.confirmed=false;}
  private persist(record: PromotionCheckoutRecord): void {
    if (!this.ports.current()) throw new Error('ACCOUNT_SCOPE_CHANGED');
    this.ports.save(record);
    this.record = record;
  }
  canExecute(operation:PromotionOperation):boolean {
    return !this.busy&&!this.unknown&&(!this.record.pending||(this.retryOriginal&&this.record.pending.operation===operation));
  }
  async create(): Promise<void> {
    const q = this.record.quote;
    if (!q || q.eligibility !== 'ELIGIBLE' || this.record.order) throw new Error('QUOTE_NOT_CONFIRMABLE');
    await this.mutate(q.items.length > 1 ? 'createBundle' : 'createOrder', q.quoteId, key => this.ports.api.create(q, key,this.record.voucherId??null));
  }
  async pay(): Promise<void> {
    const order = this.record.order;
    if (!order || !this.confirmed || order.paymentStatus !== 'PENDING') throw new Error('ORDER_NOT_CONFIRMED');
    await this.mutate('payOrder', order.orderNo, key => this.ports.api.pay(order.orderNo, key));
  }
  async cancel(): Promise<void> {
    const order = this.record.order;
    if (!order || !this.confirmed || order.paymentStatus !== 'PENDING') throw new Error('ORDER_NOT_CONFIRMED');
    await this.mutate('cancelOrder', order.orderNo, key => this.ports.api.cancel(order.orderNo, key));
  }
  private async mutate(operation: PromotionOperation, targetId: string, command: (key: string) => Promise<OrderReceipt>): Promise<void> {
    if (this.busy || (this.record.pending && !this.retryOriginal)) throw new Error('ORIGINAL_COMMAND_UNRESOLVED');
    const previous = this.record.pending;
    if (previous && (previous.operation !== operation || previous.targetId !== targetId)) throw new Error('ORIGINAL_COMMAND_UNRESOLVED');
    const pending = previous ?? { operation, targetId, key: this.ports.key(`${operation}:${targetId}`) };
    this.persist({ ...this.record, pending }); // Must succeed before the network write.
    this.busy = true;
    this.retryOriginal = false;
    try {
      const order = await command(pending.key);
      if (!this.ports.current()) return;
      this.acceptOrder(order);
    } catch (error) {
      if (this.ports.current()) { this.unknown = true; this.confirmed = false; }
      throw error;
    } finally { this.busy = false; }
  }
  private validateOrder(order: OrderReceipt): void {
    const previous = this.record.order;
    if (previous && previous.orderNo !== order.orderNo) throw new Error('ORIGINAL_ORDER_MISMATCH');
    const q = this.record.quote;
    const decimal = (value: unknown) => String(value).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
    if (q && (order.promotionQuoteId !== q.quoteId || order.quantity !== q.quantity || decimal(order.amountUsdt) !== decimal(q.amountUsdt))) throw new Error('ORDER_QUOTE_MISMATCH');
    if (!order.promotionQuoteId || !order.payBy || !Array.isArray(order.rewards)||!Array.isArray(order.items)||!order.items.length) throw new Error('ORDER_RECEIPT_INCOMPLETE');
    const stable = (value: unknown): string => JSON.stringify(value, function(_key, entry) { return entry && typeof entry==='object' && !Array.isArray(entry) ? Object.fromEntries(Object.keys(entry).sort().map(key=>[key,entry[key]])) : entry; });
    // Quote line IDs identify the requested SKU; a created order replaces them
    // with its canonical order-line IDs. All approved reward content must match.
    type PurchaseLine={lineId:string;productNo:string;quantity:number};
    const rewards=(rows:NonNullable<OrderReceipt['rewards']>,items:PurchaseLine[],originalQuote?:Quote)=>rows.map(({lineId,...reward})=>{
      const item=items.find(item=>item.lineId===lineId);if(!item)throw new Error('ORDER_REWARD_LINE_MISSING');
      const original=originalQuote?.expectedRewards.find(candidate=>originalQuote.items.find(line=>line.lineId===candidate.lineId)?.productNo===item.productNo&&candidate.rewardRuleId===reward.rewardRuleId&&candidate.ruleId===reward.ruleId&&candidate.beneficiaryRole===reward.beneficiaryRole);
      // A legacy quote may predate frozen display names. Only that absent name
      // can be enriched; SKU, policy, amount, quantity and all terms still match.
      if(original?.disclosure&&!Object.prototype.hasOwnProperty.call(original.disclosure,'deviceName')&&reward.disclosure){
        const {deviceName:_name,...priorDisclosure}=reward.disclosure;
        return stable({...reward,disclosure:priorDisclosure,purchaseProductNo:item.productNo});
      }
      return stable({...reward,purchaseProductNo:item.productNo});
    }).sort();
    if(q){
      const items=(rows:PurchaseLine[])=>rows.map(({productNo,quantity})=>stable({productNo,quantity})).sort();
      if(stable(items(order.items))!==stable(items(q.items)))throw new Error('ORDER_ITEMS_MISMATCH');
      if(stable(rewards(order.rewards,order.items,q))!==stable(rewards(q.expectedRewards,q.items)))throw new Error('ORDER_REWARDS_MISMATCH');
    }
  }
  private acceptOrder(order: OrderReceipt): void {
    this.validateOrder(order);
    this.persist({ ...this.record, order, pending: null });
    this.unknown = false;
    this.confirmed = true;
  }
  resume(order:OrderReceipt):void {
    if(this.record.pending||this.record.order||this.busy)throw new Error('ORIGINAL_COMMAND_UNRESOLVED');
    this.acceptOrder(order);
  }
  startNewPurchase():void {
    if(this.busy||this.unknown||!this.confirmed||this.record.pending||!this.record.order||!['PAID','CANCELLED','EXPIRED','REFUNDED'].includes(this.record.order.paymentStatus))throw new Error('ORIGINAL_ORDER_UNRESOLVED');
    this.persist({quote:null,order:null,pending:null});this.confirmed=false;this.retryOriginal=false;
  }
  async recover(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const pending = this.record.pending;
      if (pending) {
        const result = await this.ports.api.command(pending.key, pending.operation, pending.targetId);
        if (!this.ports.current()) return;
        if (result.status === 'SUCCEEDED' && result.order) this.acceptOrder(result.order);
        else if(result.status==='FAILED'&&!result.order){
          if(this.record.order){
            const order=await this.ports.api.findOrder(this.record.order.orderNo);
            if(!this.ports.current())return;
            if(!order){this.unknown=true;this.confirmed=false;return;}
            this.acceptOrder(order);
          }else{this.persist({quote:null,order:null,pending:null});this.unknown=false;this.confirmed=false;}
          this.retryOriginal=false;
        } else if (result.status === 'NOT_FOUND') {
          this.unknown = false;
          this.retryOriginal = true; // Explicit retry keeps both the original target and key.
          if (this.record.order) {
            const order = await this.ports.api.findOrder(this.record.order.orderNo);
            if (!this.ports.current())return;
            if(order){this.validateOrder(order);this.persist({...this.record,order});this.confirmed=true;}
            else {this.unknown=true;this.confirmed=false;this.retryOriginal=false;}
          }
        } else { this.unknown = true; this.confirmed = false; }
      } else if (this.record.order) {
        const order = await this.ports.api.findOrder(this.record.order.orderNo);
        if (this.ports.current() && order) this.acceptOrder(order);
        else if (this.ports.current()) { this.unknown = true; this.confirmed = false; }
      }
    } finally { this.busy = false; }
  }
}
