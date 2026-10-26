import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type HttpResponse } from './api-client';
import { ApiError, asApiError, isAmbiguousOutcome, MAX_RETRY_AFTER_MS, parseRetryAfterMs } from './errors';
import { createSessionVault } from './session-vault';

const now = Date.parse('2026-10-27T00:00:00Z');

afterEach(() => { vi.restoreAllMocks(); });

describe('bounded HTTP Retry-After parsing', () => {
  it.each([
    { value: '0', expected: 0 },
    { value: '12', expected: 12_000 },
    { value: '  003 \t', expected: 3_000 },
    { value: '2147483', expected: 2_147_483_000 },
  ])('converts delta-seconds $value to milliseconds', ({ value, expected }) => {
    expect(parseRetryAfterMs(value, now)).toBe(expected);
  });

  it('converts an HTTP date relative to response processing time', () => {
    const header = new Date(now + 15_000).toUTCString();
    expect(parseRetryAfterMs(header, now)).toBe(15_000);
    expect(parseRetryAfterMs(header, now + 250)).toBe(14_750);
    expect(parseRetryAfterMs(header, now + 15_000)).toBe(0);
    expect(parseRetryAfterMs(header, now + 20_000)).toBe(0);
  });

  it.each([undefined, null, 0, '', ' ', '-1', '1.5', 'NaN', 'Infinity', '1e3', '0x10', '1, 2',
    'not a date', 'Tue, invalid GMT', '9'.repeat(40), '0'.repeat(129), '2147484'])
    ('ignores invalid or unrepresentable headers %#', value => {
      expect(parseRetryAfterMs(value, now)).toBeUndefined();
    });

  it('does not clamp an oversized server deadline into an earlier retry', () => {
    expect(parseRetryAfterMs(new Date(now + MAX_RETRY_AFTER_MS + 10_000).toUTCString(), now)).toBeUndefined();
    expect(parseRetryAfterMs(new Date(now + 1000).toUTCString(), NaN)).toBeUndefined();
  });

  it.each([-1, NaN, Infinity, 0.5, MAX_RETRY_AFTER_MS + 1])('does not expose unsafe timer values through manually constructed ApiError %#', retryAfterMs => {
    expect(new ApiError({ kind: 'http', message: 'HTTP_429', status: 429, retryAfterMs }).retryAfterMs).toBeUndefined();
  });
});

function setup(response: HttpResponse) {
  const vault = createSessionVault();
  vault.save({ accessToken: 'test', refreshToken: 'test-refresh', tokenType: 'Bearer',
    user: { userId: 42, countryCode: '+84', phone: '912345678', nickname: 'Fixture', onboardingComplete: true } });
  const request = vi.fn().mockResolvedValue(response);
  const upload = vi.fn().mockResolvedValue(response);
  const client = createApiClient({ baseUrl: 'https://example.test', vault, transport: { request, upload } });
  return { client, request, upload };
}

describe('API client retry metadata', () => {
  it.each(['Retry-After', 'retry-after', 'RETRY-AFTER'])('preserves %s without retrying or changing unknown delivery classification', async header => {
    const { client, request } = setup({ status: 429, headers: { [header]: '8' },
      data: { code: 429, message: 'RATE_LIMITED', data: null } });
    const cause = await client.request({ method: 'POST', path: '/api/app/support/conversations',
      idempotencyKey: 'original-key', body: { openingText: 'Message' } }).catch(error => error);
    expect(cause).toBeInstanceOf(ApiError);
    expect(cause).toMatchObject({ kind: 'http', status: 429, code: 429, message: 'RATE_LIMITED', retryAfterMs: 8000 });
    expect(asApiError(cause)).toBe(cause);
    expect(isAmbiguousOutcome(cause)).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0]).toMatchObject({ headers: { 'Idempotency-Key': 'original-key' } });
  });

  it('preserves a 503 HTTP-date hint and its original retryable error semantics', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const { client } = setup({ status: 503, headers: { 'Retry-After': new Date(now + 30_000).toUTCString() },
      data: { code: 503, message: 'UNAVAILABLE', data: null } });
    const cause = await client.request({ path: '/api/app/support/conversations' }).catch(error => error);
    expect(cause).toMatchObject({ kind: 'http', status: 503, retryable: true, retryAfterMs: 30_000 });
    expect(isAmbiguousOutcome(cause)).toBe(true);
  });

  it.each(['0', 'bad value', undefined])('distinguishes a zero cooldown from an absent or invalid one: %s', async value => {
    const { client } = setup({ status: 429, headers: value === undefined ? {} : { 'Retry-After': value },
      data: { code: 429, message: 'RATE_LIMITED', data: null } });
    const cause = await client.request({ path: '/api/app/support/conversations' }).catch(error => error);
    expect(cause).toBeInstanceOf(ApiError);
    expect(asApiError(cause).retryAfterMs).toBe(value === '0' ? 0 : undefined);
  });

  it('preserves an HTTP hint on a business envelope without reclassifying it', async () => {
    const { client } = setup({ status: 200, headers: { 'Retry-After': '4' },
      data: { code: 10001, message: 'BUSINESS_REJECTED', data: null } });
    await expect(client.request({ path: '/api/app/support/conversations' })).rejects.toMatchObject({
      kind: 'business', status: 200, code: 10001, retryAfterMs: 4000,
    });
  });

  it('keeps malformed successful responses ambiguous while carrying the hint', async () => {
    const { client } = setup({ status: 200, headers: { 'Retry-After': '4' }, data: 'not an envelope' });
    const cause = await client.request({ path: '/api/app/support/conversations' }).catch(error => error);
    expect(cause).toMatchObject({ kind: 'protocol', message: 'API_ENVELOPE_INVALID', retryAfterMs: 4000 });
    expect(isAmbiguousOutcome(cause)).toBe(true);
  });

  it('passes available upload response headers through the same error contract', async () => {
    const { client, request, upload } = setup({ status: 429, headers: { 'Retry-After': '5' },
      data: { code: 429, message: 'RATE_LIMITED', data: null } });
    await expect(client.upload({ path: '/api/app/support/attachments', filePath: 'local-image.jpg',
      idempotencyKey: 'original-upload-key' })).rejects.toMatchObject({ kind: 'http', status: 429, retryAfterMs: 5000 });
    expect(upload).toHaveBeenCalledOnce();
    expect(request).not.toHaveBeenCalled();
  });

  it('returns an accepted response immediately even when it contains Retry-After', async () => {
    const { client, request } = setup({ status: 200, headers: { 'Retry-After': '20' },
      data: { code: 0, message: 'OK', data: { saved: true } } });
    await expect(client.request({ path: '/api/app/support/conversations' })).resolves.toEqual({ saved: true });
    expect(request).toHaveBeenCalledOnce();
  });
});
