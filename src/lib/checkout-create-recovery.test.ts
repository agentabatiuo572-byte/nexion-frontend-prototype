import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readCheckoutCreate, rememberCheckoutCreate, forgetCheckoutCreate, type PendingCheckoutCreate } from './checkout-create-recovery';
let disk: Record<string, unknown>;
const entry: PendingCheckoutCreate = { request: { productNo: 's1', quantity: 1, voucherId: 'voucher-original', idempotencyKey: 'create-original' }, intent: 's1|voucher-original|wallet|ordinary', subtotal: 1299, discount: 100, amount: 1199 };
beforeEach(() => {
  disk = {};
  vi.stubGlobal('uni', { getStorageSync: (key:string) => structuredClone(disk[key]), setStorageSync: (key:string,value:unknown) => { disk[key]=structuredClone(value); } });
});
describe('unknown order creation survives with its exact original intent', () => {
  it('restores the original request and reviewed amounts across independent reads', () => {
    rememberCheckoutCreate('a',entry);
    const restored=readCheckoutCreate('a','s1');
    expect(restored).toEqual(entry); expect(restored).not.toBe(entry);
    expect(readCheckoutCreate('b','s1')).toBeNull(); expect(readCheckoutCreate('a','other')).toBeNull();
  });
  it('does not replace an unresolved command with a different key', () => {
    rememberCheckoutCreate('a',entry);
    expect(()=>rememberCheckoutCreate('a',{...entry,request:{...entry.request,idempotencyKey:'new'}})).toThrow('CHECKOUT_RECOVERY_PENDING');
    expect(readCheckoutCreate('a','s1')).toEqual(entry);
  });
  it('clears only the same recovered key', () => {
    rememberCheckoutCreate('a',entry);forgetCheckoutCreate('a',{...entry,request:{...entry.request,idempotencyKey:'other'}});
    expect(readCheckoutCreate('a','s1')).toEqual(entry);
    forgetCheckoutCreate('a',entry);expect(readCheckoutCreate('a','s1')).toBeNull();
  });
  it('rejects damaged persisted request data rather than creating a replacement', () => {
    rememberCheckoutCreate('a',entry);
    const table=Object.values(disk)[0] as Record<string,{creates:Record<string,PendingCheckoutCreate>}>;
    Object.values(table)[0].creates.s1.request.quantity=2;
    expect(()=>readCheckoutCreate('a','s1')).toThrow('ACCOUNT_COMMAND_STORAGE_UNAVAILABLE');
  });
  it('cannot dispatch a new command when persistence fails', () => {
    vi.stubGlobal('uni',{getStorageSync:()=>undefined,setStorageSync:()=>{throw new Error('disk failure');}});
    expect(()=>rememberCheckoutCreate('a',entry)).toThrow('ACCOUNT_COMMAND_STORAGE_UNAVAILABLE');
  });
});
