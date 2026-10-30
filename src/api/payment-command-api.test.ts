import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api-client';
import { readPaymentCommand } from './payment-command-api';

describe('purchase result reads',()=>{
  it('uses a read-only account scoped GET without a password',async()=>{
    const request=vi.fn().mockResolvedValue({kind:'trial-convert',commandKey:'a:b',status:'SUCCEEDED',canResumeSameKey:false,receipt:{orderNo:'O1'}});
    const result=await readPaymentCommand({request} as unknown as ApiClient,'trial-convert','a:b');
    expect(request).toHaveBeenCalledWith({path:'/api/app/payment-commands/trial-convert/a%3Ab'});expect(result.receipt).toEqual({orderNo:'O1'});
  });
  it('rejects mismatched command receipts instead of displaying another transaction',async()=>{
    const request=vi.fn().mockResolvedValue({kind:'trade-in',commandKey:'wrong',status:'SUCCEEDED',canResumeSameKey:false,receipt:{orderNo:'O2'}});
    await expect(readPaymentCommand({request} as unknown as ApiClient,'trade-in','original')).rejects.toMatchObject({message:'PAYMENT_COMMAND_RESPONSE_INVALID'});
  });
  it('keeps NOT_SEEN distinct from confirmed failure',async()=>{
    const request=vi.fn().mockResolvedValue({kind:'capacity-keep',commandKey:'K',status:'NOT_SEEN',canResumeSameKey:true});
    expect(await readPaymentCommand({request} as unknown as ApiClient,'capacity-keep','K')).toMatchObject({status:'NOT_SEEN',canResumeSameKey:true});expect(request).toHaveBeenCalledTimes(1);
  });
});
