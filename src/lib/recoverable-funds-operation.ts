export interface RecoverableFundsHandlers<T> {
  success(value: T): void | Promise<void>;
  failure(reason: string): void | Promise<void>;
  settled(): void | Promise<void>;
}

function failureReason(cause: unknown, fallback: string): string {
  // 焦虑文案收口(2026-08-15):原始 message/错误码是给工程师的,只进日志;
  // 用户面渲染 fallback(调用方传人话文案,不再传 SCREAMING_CODE)。
  console.warn("[funds-operation] failed:", cause);
  return fallback;
}

/**
 * UI recovery boundary for an external-funds request. It intentionally turns a
 * rejected request into a rendered failure state, while `settled` guarantees
 * that spinners/3DS loading gates cannot remain latched.
 */
export async function runRecoverableFundsOperation<T>(
  operation: () => Promise<T>,
  handlers: RecoverableFundsHandlers<T>,
  fallback = "FUNDS_OPERATION_FAILED",
): Promise<T | null> {
  try {
    const value = await operation();
    await handlers.success(value);
    return value;
  } catch (cause) {
    await handlers.failure(failureReason(cause, fallback));
    return null;
  } finally {
    await handlers.settled();
  }
}
