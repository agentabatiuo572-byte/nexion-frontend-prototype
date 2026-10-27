import { ApiError, isAmbiguousOutcome } from '@/api/errors';

/** Human chat: a bounded acknowledgement wait, then one readback of the same command. */
export const MESSAGE_ACK_TIMEOUT_MS = 12_000;
export const MESSAGE_READBACK_TIMEOUT_MS = 3_000;
export const MESSAGE_SEND_WAIT_MS = MESSAGE_ACK_TIMEOUT_MS + MESSAGE_READBACK_TIMEOUT_MS;

/** The server checks the stored peer before writing any new message. */
export function isConversationPeerChanged(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.kind === 'http' || cause.kind === 'business')
    && (cause.status ?? cause.code) === 409 && cause.message === 'CONVERSATION_PEER_CHANGED';
}

/** These clear conflicts are returned before any user visibility watermark is written. */
export function isConversationUserClearRejected(cause: unknown): boolean {
  return cause instanceof ApiError && (cause.kind === 'http' || cause.kind === 'business')
    && (cause.status ?? cause.code) === 409
    && (cause.message === 'CONVERSATION_USER_CLEAR_CONFLICT' || cause.message === 'CONVERSATION_USER_CLEAR_MEMBERS_CHANGED');
}

/** WebSocket ack codes use HTTP meanings; ordinary business codes remain explicit rejections. */
export function isConversationDeliveryAmbiguous(cause: unknown): boolean {
  if (isConversationPeerChanged(cause)) return false;
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
