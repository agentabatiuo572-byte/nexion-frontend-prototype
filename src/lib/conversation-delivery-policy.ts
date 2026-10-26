import { ApiError, isAmbiguousOutcome } from '@/api/errors';

/** Human chat: a bounded acknowledgement wait, then one readback of the same command. */
export const MESSAGE_ACK_TIMEOUT_MS = 12_000;
export const MESSAGE_READBACK_TIMEOUT_MS = 3_000;
export const MESSAGE_SEND_WAIT_MS = MESSAGE_ACK_TIMEOUT_MS + MESSAGE_READBACK_TIMEOUT_MS;

/** WebSocket ack codes use HTTP meanings; ordinary business codes remain explicit rejections. */
export function isConversationDeliveryAmbiguous(cause: unknown): boolean {
  if (isAmbiguousOutcome(cause)) return true;
  if (!(cause instanceof ApiError) || cause.kind !== 'business') return false;
  const code = cause.status ?? cause.code ?? 0;
  return [408, 409, 425, 429].includes(code) || (code >= 500 && code <= 599);
}

/** Timing out is ambiguous: keep the original idempotency key for recovery. */
export async function awaitMessageOutcome<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ApiError({ kind: 'network', message: 'CONVERSATION_DELIVERY_UNKNOWN', retryable: true })), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
