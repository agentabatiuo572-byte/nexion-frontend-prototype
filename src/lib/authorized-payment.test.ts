import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
import { ref } from 'vue';
const pin = vi.hoisted(()=>({request:vi.fn(),report:vi.fn(),cancel:vi.fn(),warn:vi.fn()}));
vi.mock('@/store/payment-password',()=>({requestPaymentPassword:pin.request,reportPaymentPasswordError:pin.report,cancelPaymentPassword:pin.cancel}));
vi.mock('@/store/ui',()=>({toast:{warn:pin.warn}}));
vi.mock('@/store/locale',()=>({useLocaleStore:()=>({code:'zh'})}));
import { executePaymentWithPassword } from './authorized-payment';

const context={amount:'12.00',currency:'USDT',summary:'Device'};
const authorization=()=>({paymentPassword:'024680',credentialVersion:1,attemptNo:crypto.randomUUID()});
describe('payment command authorization',()=>{
  beforeEach(()=>vi.resetAllMocks());
  it('cancellation never calls the purchase command',async()=>{
    pin.request.mockResolvedValue(null);const command=vi.fn();
    expect(await executePaymentWithPassword(context,command,()=>true)).toBeNull();expect(command).not.toHaveBeenCalled();
  });
  it('re-enters a rejected PIN for the same command and clears both secret objects',async()=>{
    const first=authorization(),second=authorization();pin.request.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const error=new ApiError({kind:'business',message:'PAYMENT_PASSWORD_INCORRECT',status:422});
    const command=vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce({orderNo:'O-1'});
    expect(await executePaymentWithPassword(context,command,()=>true)).toEqual({orderNo:'O-1'});
    expect(command).toHaveBeenCalledTimes(2);expect(pin.report).toHaveBeenCalledWith(error);
    expect(first.paymentPassword).toBe('');expect(second.paymentPassword).toBe('');
  });
  it('never auto retries an unknown network result',async()=>{
    const secret=authorization();pin.request.mockResolvedValue(secret);
    const error=new ApiError({kind:'network',message:'TIMEOUT'});const command=vi.fn().mockRejectedValue(error);
    await expect(executePaymentWithPassword(context,command,()=>true)).rejects.toBe(error);
    expect(command).toHaveBeenCalledTimes(1);expect(secret.paymentPassword).toBe('');expect(pin.report).not.toHaveBeenCalled();
  });
  it('an account or quote change during input prevents the write',async()=>{
    let current=true;const secret=authorization();pin.request.mockImplementation(async()=>{current=false;return secret;});const command=vi.fn();
    expect(await executePaymentWithPassword(context,command,()=>current)).toBeNull();expect(command).not.toHaveBeenCalled();expect(secret.paymentPassword).toBe('');
  });
  it('immediately closes input when a same-amount quote version changes',async()=>{
    const quoteVersion=ref(1),command=vi.fn();
    let resolve!: (value: null) => void;
    pin.request.mockImplementation(()=>new Promise(done=>{resolve=done;}));
    pin.cancel.mockImplementation(()=>resolve(null));
    const pending=executePaymentWithPassword(context,command,()=>quoteVersion.value===1);
    quoteVersion.value=2;
    expect(pin.cancel).toHaveBeenCalledOnce();
    expect(pin.warn).toHaveBeenCalledWith('订单信息已更新，请重新确认后支付');
    await expect(pending).resolves.toBeNull();expect(command).not.toHaveBeenCalled();
    quoteVersion.value=3;expect(pin.cancel).toHaveBeenCalledOnce();
  });
});
