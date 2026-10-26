import { describe, expect, it } from 'vitest';
import { ApiError, asApiError } from '@/api/errors';
import { isConversationDeliveryAmbiguous } from './conversation-delivery-policy';
import { MESSAGE_MAX_LENGTH, MessageTextValidationError, normalizeMessageText } from './message-length-policy';

describe('shared message text contract', () => {
  it('uses the existing 2000 UTF-16 unit boundary after trimming', () => {
    expect(MESSAGE_MAX_LENGTH).toBe(2000);
    const text = '中'.repeat(2000);
    expect(normalizeMessageText(` \t\n${text}\r\n\u3000`)).toBe(text);
  });

  it.each(['Hello\nsecond line', '中文\n第二行', 'Tiếng Việt\nDòng thứ hai'])('preserves internal whitespace and multiline content: %s', text => {
    expect(normalizeMessageText(` \n${text} \n`)).toBe(text);
  });

  it.each(['x'.repeat(1999), '😀'.repeat(1000), 'e\u0301'.repeat(1000)])('accepts complete content at or below the UTF-16 limit %#', text => {
    expect(normalizeMessageText(text)).toBe(text);
  });

  it.each(['x'.repeat(2001), `${'😀'.repeat(1000)}x`, `${'e\u0301'.repeat(1000)}x`])('rejects excess content without truncating or counting graphemes %#', text => {
    expect(() => normalizeMessageText(text)).toThrowError(MessageTextValidationError);
    expect(() => normalizeMessageText(text, { allowEmpty: true })).toThrowError('MESSAGE_TEXT_TOO_LONG');
  });

  it.each(['', ' \t\n\r\u3000'])('allows an empty normalized image caption only when requested %#', text => {
    expect(() => normalizeMessageText(text)).toThrowError('MESSAGE_TEXT_REQUIRED');
    expect(normalizeMessageText(text, { allowEmpty: true })).toBe('');
  });

  it.each([null, undefined, 2000, {}, ['text']])('rejects non-string input even for image captions %#', value => {
    expect(() => normalizeMessageText(value, { allowEmpty: true })).toThrowError('MESSAGE_TEXT_INVALID');
  });

  it.each([
    { value: '', reason: 'required', message: 'MESSAGE_TEXT_REQUIRED' },
    { value: 'x'.repeat(2001), reason: 'too_long', message: 'MESSAGE_TEXT_TOO_LONG' },
    { value: null, reason: 'invalid_type', message: 'MESSAGE_TEXT_INVALID' },
  ])('exposes a stable, settled pre-dispatch error for $reason', ({ value, reason, message }) => {
    let caught: unknown;
    try { normalizeMessageText(value); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(MessageTextValidationError);
    expect(caught).toBeInstanceOf(ApiError);
    expect(caught).toMatchObject({ name: 'MessageTextValidationError', reason, message, kind: 'business', code: 422, retryable: false });
    expect(asApiError(caught)).toBe(caught);
    expect(isConversationDeliveryAmbiguous(caught)).toBe(false);
  });
});
