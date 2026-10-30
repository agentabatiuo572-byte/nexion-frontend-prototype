import {readAccountRow,writeAccountRow} from '@/store/account-scoped-storage';
import {requireCryptoUuid} from '@/lib/secure-command-id';

const TABLE='nexgrid-order-action-accounts-v1';
export type PendingOrderAction={kind:'pay'|'cancel';orderNo:string;key:string;amount:number|null;phase:'pending'|'paid'};
type ActionRow={actions:Record<string,PendingOrderAction>;paymentKeys?:Record<string,string>};

export function readOrderAction(accountKey:string,orderNo:string):PendingOrderAction|null {
  const row=readAccountRow<ActionRow>(TABLE,accountKey,true);
  const action=row?.actions?.[orderNo];
  if (!action) return null;
  if (action.orderNo!==orderNo || !['pay','cancel'].includes(action.kind) || typeof action.key!=='string'
      || (action.kind==='cancel'?action.key!==`order-cancel:${orderNo}`
        :action.key!==`wallet-pay:${orderNo}`&&!action.key.startsWith(`wallet-pay:${orderNo}:`))
      || !['pending','paid'].includes(action.phase) || (action.kind==='pay'&&(!Number.isFinite(action.amount)||action.amount!<0))
      || (action.kind==='cancel'&&(action.amount!==null||action.phase!=='pending'))) throw new Error('ORDER_COMMAND_STORAGE_INVALID');
  return action;
}

export function beginOrderAction(accountKey:string,kind:PendingOrderAction['kind'],orderNo:string,amount:number|null):PendingOrderAction {
  const current=readOrderAction(accountKey,orderNo);
  if (current) {
    if (current.kind!==kind || current.amount!==amount || current.phase==='paid') throw new Error('ORIGINAL_ORDER_COMMAND_UNRESOLVED');
    return current;
  }
  const row=readAccountRow<ActionRow>(TABLE,accountKey,true);
  const action:PendingOrderAction={kind,orderNo,key:kind==='pay'?(row?.paymentKeys?.[orderNo]??`wallet-pay:${orderNo}`):`order-cancel:${orderNo}`,amount,phase:'pending'};
  if (!writeAccountRow(TABLE,accountKey,{actions:{...row?.actions,[orderNo]:action},paymentKeys:row?.paymentKeys})
      || readOrderAction(accountKey,orderNo)?.key!==action.key) throw new Error('ACCOUNT_COMMAND_STORAGE_UNAVAILABLE');
  return action;
}

export function markOrderActionPaid(accountKey:string,orderNo:string):void {
  const action=readOrderAction(accountKey,orderNo);
  if (!action || action.kind!=='pay') throw new Error('ORIGINAL_ORDER_COMMAND_UNRESOLVED');
  const row=readAccountRow<ActionRow>(TABLE,accountKey,true);
  if (!writeAccountRow(TABLE,accountKey,{actions:{...row?.actions,[orderNo]:{...action,phase:'paid'}},paymentKeys:row?.paymentKeys})
      || readOrderAction(accountKey,orderNo)?.phase!=='paid') throw new Error('ACCOUNT_COMMAND_STORAGE_UNAVAILABLE');
}

export function clearOrderAction(accountKey:string,orderNo:string,expectedKey:string,terminalRejection=false):void {
  const action=readOrderAction(accountKey,orderNo);
  if (!action || action.key!==expectedKey) return;
  const row=readAccountRow<ActionRow>(TABLE,accountKey,true),actions={...row?.actions};
  const paymentKeys={...row?.paymentKeys};
  // Only a terminal purchase-command rejection can retire a payment intent.
  if (terminalRejection&&action.kind==='pay') paymentKeys[orderNo]=`wallet-pay:${orderNo}:${requireCryptoUuid()}`;
  delete actions[orderNo];
  if (!writeAccountRow(TABLE,accountKey,{actions,paymentKeys}) || readOrderAction(accountKey,orderNo)) throw new Error('ACCOUNT_COMMAND_STORAGE_UNAVAILABLE');
}
