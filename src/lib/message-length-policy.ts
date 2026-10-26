import { ApiError } from '@/api/errors';

/** Existing human/Nova input contract, counted in UTF-16 code units after trim. */
export const MESSAGE_MAX_LENGTH = 2_000;

export type MessageTextValidationReason = 'required' | 'too_long' | 'invalid_type';

const errorMessages: Record<MessageTextValidationReason, string> = {
  required: 'MESSAGE_TEXT_REQUIRED',
  too_long: 'MESSAGE_TEXT_TOO_LONG',
  invalid_type: 'MESSAGE_TEXT_INVALID',
};

/** Local rejection before dispatch; never an ambiguous delivery outcome. */
export class MessageTextValidationError extends ApiError {
  readonly reason: MessageTextValidationReason;

  constructor(reason: MessageTextValidationReason) {
    super({ kind: 'business', code: 422, message: errorMessages[reason], retryable: false });
    this.name = 'MessageTextValidationError';
    this.reason = reason;
  }
}

/** Preserve the entire normalized message or reject it; never truncate. */
export function normalizeMessageText(value: unknown, options: { allowEmpty?: boolean } = {}): string {
  if (typeof value !== 'string') throw new MessageTextValidationError('invalid_type');
  const text = value.trim();
  if (text.length > MESSAGE_MAX_LENGTH) throw new MessageTextValidationError('too_long');
  if (!text && !options.allowEmpty) throw new MessageTextValidationError('required');
  return text;
}
