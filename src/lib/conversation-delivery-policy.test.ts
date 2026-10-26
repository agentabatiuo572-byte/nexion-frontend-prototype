import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/errors';
import { awaitMessageOutcome, isConversationDeliveryAmbiguous,
  MESSAGE_ACK_TIMEOUT_MS, MESSAGE_READBACK_TIMEOUT_MS, MESSAGE_SEND_WAIT_MS } from './conversation-delivery-policy';

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('human delivery uncertainty', () => {
  it.each([408, 409, 425, 429, 500, 502, 503, 504, 599])('preserves uncertainty for HTTP and WebSocket acknowledgement %i', code => {
    for (const options of [{ kind: 'http' as const, status: code },
      { kind: 'business' as const, code }, { kind: 'business' as const, status: code }]) {
      expect(isConversationDeliveryAmbiguous(new ApiError({ ...options, message: 'acknowledgement' }))).toBe(true);
    }
  });

  it.each([400, 401, 403, 404, 422])('treats explicit HTTP and WebSocket refusal %i as settled', code => {
    for (const options of [{ kind: 'http' as const, status: code }, { kind: 'business' as const, code }]) {
      expect(isConversationDeliveryAmbiguous(new ApiError({ ...options, message: 'refused', retryable: true }))).toBe(false);
    }
  });

  it.each([undefined, 0, 10001, 50001])('does not reinterpret ordinary business code %s as an HTTP timeout', code => {
    expect(isConversationDeliveryAmbiguous(new ApiError({ kind: 'business', code, message: 'explicit business refusal' }))).toBe(false);
  });

  it.each([new Error('socket closed'), undefined, new ApiError({ kind: 'network', message: 'timeout' }),
    new ApiError({ kind: 'protocol', message: 'unreadable reply' }), new ApiError({ kind: 'http', message: 'missing status' })])(
    'keeps unconfirmed transport outcomes recoverable: %s', cause => {
      expect(isConversationDeliveryAmbiguous(cause)).toBe(true);
    });

  it('uses an explicit status ahead of a business envelope code', () => {
    expect(isConversationDeliveryAmbiguous(new ApiError({ kind: 'business', status: 403, code: 503, message: 'refused' }))).toBe(false);
    expect(isConversationDeliveryAmbiguous(new ApiError({ kind: 'business', status: 503, code: 10001, message: 'unknown' }))).toBe(true);
  });
});

describe('bounded delivery wait', () => {
  it('budgets 12 seconds for acknowledgement plus 3 seconds for authoritative readback', () => {
    expect(MESSAGE_ACK_TIMEOUT_MS).toBe(12_000);
    expect(MESSAGE_READBACK_TIMEOUT_MS).toBe(3_000);
    expect(MESSAGE_SEND_WAIT_MS).toBe(15_000);
  });

  it.each([12_000, 3_000])('does not fail early and rejects a hung operation at exactly %i ms as unknown', async timeout => {
    const settled = vi.fn();
    const done = awaitMessageOutcome(new Promise<never>(() => {}), timeout).then(settled, settled);
    await vi.advanceTimersByTimeAsync(timeout - 1);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); await done;
    expect(settled).toHaveBeenCalledOnce();
    const cause = settled.mock.calls[0][0];
    expect(cause).toBeInstanceOf(ApiError);
    expect(cause).toMatchObject({ kind: 'network', retryable: true });
    expect(isConversationDeliveryAmbiguous(cause)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['resolve', 'reject'] as const)('returns the exact early %s outcome and releases its timer', async outcome => {
    const value = { id: 'canonical-message' }, refusal = new ApiError({ kind: 'business', code: 403, message: 'refused' });
    const operation = outcome === 'resolve' ? Promise.resolve(value) : Promise.reject(refusal);
    const settled = vi.fn();
    await awaitMessageOutcome(operation, MESSAGE_ACK_TIMEOUT_MS).then(settled, settled);
    expect(settled).toHaveBeenCalledExactlyOnceWith(outcome === 'resolve' ? value : refusal);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(settled).toHaveBeenCalledOnce();
  });

  it.each(['resolve', 'reject'] as const)('ignores a late %s without a second completion or unhandled rejection', async outcome => {
    let resolve!: (value: string) => void, reject!: (cause: unknown) => void;
    const operation = new Promise<string>((done, fail) => { resolve = done; reject = fail; });
    const settled = vi.fn();
    const done = awaitMessageOutcome(operation, 12_000).then(settled, settled);
    await vi.advanceTimersByTimeAsync(12_000); await done;
    if (outcome === 'resolve') resolve('late server receipt'); else reject(new Error('late disconnect'));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledOnce();
    expect(isConversationDeliveryAmbiguous(settled.mock.calls[0][0])).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
