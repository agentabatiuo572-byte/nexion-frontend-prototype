import { beforeEach, describe, expect, it, vi } from 'vitest';
const storage=vi.hoisted(()=>({rows:new Map<string,unknown>(),uuid:vi.fn(()=> 'new-revision')}));
vi.mock('@/store/account-scoped-storage',()=>({
  readAccountRow:(_table:string,account:string)=>structuredClone(storage.rows.get(account)??null),
  writeAccountRow:(_table:string,account:string,row:unknown)=>{storage.rows.set(account,structuredClone(row));return true;},
}));
vi.mock('@/lib/secure-command-id',()=>({requireCryptoUuid:storage.uuid}));
import {beginOrderAction,clearOrderAction,readOrderAction} from './order-command-fence';
const original={kind:'pay' as const,orderNo:'ORDER-1',key:'wallet-pay:ORDER-1:original',amount:39.8,phase:'pending' as const};
beforeEach(()=>{storage.rows.clear();storage.uuid.mockClear();});
describe('durable order payment provenance',()=>{
  it('legacy read does not infer wallet, while the explicit wallet call preserves its exact key',()=>{
    storage.rows.set('user:1',{actions:{'ORDER-1':original}});
    expect(readOrderAction('user:1','ORDER-1')?.paymentMethod).toBeUndefined();
    expect(beginOrderAction('user:1','pay','ORDER-1',39.8,'WALLET')).toEqual({...original,paymentMethod:'WALLET'});
    expect(readOrderAction('user:1','ORDER-1')).toEqual({...original,paymentMethod:'WALLET'});
    expect(storage.uuid).not.toHaveBeenCalled();
  });
  it('an actual external selection overwrites the wallet marker on the same durable identity',()=>{
    storage.rows.set('user:1',{actions:{'ORDER-1':{...original,paymentMethod:'WALLET'}}});
    expect(beginOrderAction('user:1','pay','ORDER-1',39.8,'EXTERNAL')).toEqual({...original,paymentMethod:'EXTERNAL'});
    expect(readOrderAction('user:1','ORDER-1')?.paymentMethod).toBe('EXTERNAL');
    expect(()=>beginOrderAction('user:1','pay','ORDER-1',39.8,'WALLET')).toThrow('ORIGINAL_ORDER_COMMAND_UNRESOLVED');
    expect(readOrderAction('user:1','ORDER-1')).toEqual({...original,paymentMethod:'EXTERNAL'});
    expect(storage.uuid).not.toHaveBeenCalled();
  });
  it('atomic cancellation retains the prior payment identity through storage and never rotates it',()=>{
    storage.rows.set('user:1',{actions:{'ORDER-1':{...original,paymentMethod:'WALLET'}}});
    clearOrderAction('user:1','ORDER-1',original.key,false);
    const cancellation=beginOrderAction('user:1','cancel','ORDER-1',null);
    expect(cancellation.key).toBe('order-cancel:ORDER-1');
    expect(beginOrderAction('user:1','cancel','ORDER-1',null)).toEqual(cancellation);
    expect(storage.rows.get('user:1')).toMatchObject({paymentKeys:{'ORDER-1':original.key}});
    expect(()=>beginOrderAction('user:1','pay','ORDER-1',39.8,'WALLET')).toThrow();
    clearOrderAction('user:1','ORDER-1',cancellation.key,false);
    expect(beginOrderAction('user:1','pay','ORDER-1',39.8,'WALLET').key).toBe(original.key);
    expect(storage.uuid).not.toHaveBeenCalled();
    expect(readOrderAction('user:2','ORDER-1')).toBeNull();
  });
});
