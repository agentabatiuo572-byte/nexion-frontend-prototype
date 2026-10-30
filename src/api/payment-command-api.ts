import type { ApiClient } from './api-client';
import { ApiError } from './errors';

export type PaymentCommandKind = 'order-pay' | 'trial-convert' | 'trade-in' | 'capacity-replace' | 'capacity-keep';
export type PaymentCommandReceipt = {
  status: 'SUCCEEDED' | 'REJECTED' | 'PROCESSING' | 'NOT_SEEN' | 'INDETERMINATE';
  canResumeSameKey: boolean;
  receipt?: unknown;
  message?: string;
};
export async function readPaymentCommand(client: ApiClient, kind: PaymentCommandKind, commandKey: string): Promise<PaymentCommandReceipt> {
  const value = await client.request<unknown>({path:`/api/app/payment-commands/${kind}/${encodeURIComponent(commandKey)}`});
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ApiError({kind:'protocol',message:'PAYMENT_COMMAND_RESPONSE_INVALID'});
  const row = value as Record<string, unknown>;
  if (row.kind !== kind || row.commandKey !== commandKey || !['SUCCEEDED','REJECTED','PROCESSING','NOT_SEEN','INDETERMINATE'].includes(row.status as string)
    || typeof row.canResumeSameKey !== 'boolean' || (row.status === 'SUCCEEDED' && row.receipt == null)
    || (row.message != null && typeof row.message !== 'string')) throw new ApiError({kind:'protocol',message:'PAYMENT_COMMAND_RESPONSE_INVALID'});
  return {status:row.status as PaymentCommandReceipt['status'],canResumeSameKey:row.canResumeSameKey,receipt:row.receipt,message:row.message as string|undefined};
}
