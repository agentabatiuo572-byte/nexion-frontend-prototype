import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './api-client';
import { createSessionVault } from './session-vault';
import { createSupportApi } from './support-api';
import { isSettledRejection } from './errors';
import { isTicketReplyRequired, parseTicketCreationPolicy, TicketCreationDenied, ticketCreationReasons, type TicketCreationPolicy } from './support-ticket-policy';

const policy: TicketCreationPolicy = { allowed: true, reasonCode: null, retryAfterSeconds: 0, retryAt: null,
  existingTicketNo: null, cooldownSeconds: 60, windowHours: 24, maxCreatedInWindow: 10, maxActiveTickets: 3, createdInWindow: 0, activeTickets: 0 };
function apiFor(status: number, code: number, message: string, data: unknown) {
  const vault = createSessionVault();
  vault.save({ accessToken: 'test', refreshToken: 'test-refresh', tokenType: 'Bearer',
    user: { userId: 42, countryCode: '+84', phone: '912345678', nickname: 'Fixture', onboardingComplete: true } });
  const request = vi.fn(async (_request: { method: string; url: string }) => ({ status, headers: {}, data: { code, message, data } }));
  return { api: createSupportApi(createApiClient({ baseUrl: 'http://127.0.0.1:8110', vault, transport: { request } })), request };
}
describe('server ticket creation admission', () => {
  it('reads the delivered BASIC capability without inventing admission or limits', async () => {
    const { api, request } = apiFor(200, 0, 'OK', { mode: 'BASIC' });
    expect(await api.ticketCreationPolicy()).toEqual({ mode: 'BASIC' });
    expect(request.mock.calls[0]?.[0]).toMatchObject({ method: 'GET', url: 'http://127.0.0.1:8110/api/app/support/tickets/creation-policy' });
  });
  it.each([null, {}, { mode: 'UNKNOWN' }, { mode: 'basic' }, { mode: 'BASIC', allowed: true },
    { mode: 'BASIC', cooldownSeconds: 60 }, { ...policy, mode: 'BASIC', allowed: false, reasonCode: 'SUPPORT_TICKET_CREATE_DUPLICATE' }])
    ('rejects malformed or mixed capability responses', async value => {
      const { api } = apiFor(200, 0, 'OK', value);
      await expect(api.ticketCreationPolicy()).rejects.toThrow('SUPPORT_TICKET_POLICY_INVALID');
    });
  it.each([401, 403, 404, 429, 500])('does not turn HTTP %s into BASIC capability', async status => {
    const { api } = apiFor(status, status, status === 404 ? 'SUPPORT_TICKET_NOT_FOUND' : 'UNAVAILABLE', { mode: 'BASIC' });
    await expect(api.ticketCreationPolicy()).rejects.toThrow();
  });
  it('does not confuse BASIC capability with a created ticket', async () => {
    const { api } = apiFor(200, 0, 'OK', { mode: 'BASIC' });
    await expect(api.createTicket({ category: 'technical', subject: 'Test', body: 'Test' }, 'fixture-key')).rejects.toThrow();
  });
  it.each([
    [409, 'SUPPORT_REPLY_REQUIRED', true],
    [409, 'SUPPORT_COMMAND_FAILED_RETRYABLE', false],
    [500, 'SUPPORT_REPLY_REQUIRED', false],
  ])('recognizes only the exact reply prerequisite at HTTP %s (%s)', async (status, message, expected) => {
    const { api } = apiFor(status, status, message, null);
    const cause = await api.convertConversationToTicket({ id: 'CV-1', status: 'open', version: 1 } as never,
      'technical', 'Test', 'fixture-key').catch(error => error);
    expect(isTicketReplyRequired(cause)).toBe(expected);
  });
  it('reads and validates authoritative limits', async () => {
    const { api, request } = apiFor(200, 0, 'OK', policy);
    expect(await api.ticketCreationPolicy()).toEqual(policy);
    expect(request.mock.calls[0]?.[0]).toMatchObject({ method: 'GET', url: 'http://127.0.0.1:8110/api/app/support/tickets/creation-policy' });
  });
  for (const reasonCode of ticketCreationReasons) {
    const code = reasonCode.endsWith('DUPLICATE') ? 409 : 429;
    for (const status of [200, code]) it(`preserves ${reasonCode} at HTTP ${status} as a retryable, settled refusal`, async () => {
      const denied = { ...policy, allowed: false, reasonCode, existingTicketNo: 'TK-existing', retryAfterSeconds: 30 };
      const { api } = apiFor(status, code, reasonCode, denied);
      for (const run of [() => api.createTicket({ category: 'technical', subject: 'Test', body: 'Test' }, 'fixture-key'),
        () => api.convertConversationToTicket({ id: 'CV-1', status: 'open', version: 1 } as never, 'technical', 'Test', 'fixture-key')]) {
        const cause = await run().catch(error => error);
        expect(cause).toBeInstanceOf(TicketCreationDenied);
        expect(cause.policy).toEqual(denied);
        expect(isSettledRejection(cause)).toBe(true);
      }
    });
  }
  it('does not accept a generic gateway rate limit as a known business refusal', async () => {
    const { api } = apiFor(429, 429, 'GATEWAY_LIMIT', { ...policy, allowed: false });
    const cause = await api.createTicket({ category: 'technical', subject: 'x', body: 'x' }, 'fixture-key').catch(e => e);
    expect(cause).not.toBeInstanceOf(TicketCreationDenied);
    expect(isSettledRejection(cause)).toBe(false);
  });
  it.each([{ ...policy, allowed: 'true' }, { ...policy, maxActiveTickets: 0 }, { ...policy, cooldownSeconds: -1 },
    { ...policy, allowed: false, reasonCode: null }, { ...policy, reasonCode: 'UNKNOWN' }, { ...policy, retryAfterSeconds: NaN },
    { ...policy, existingTicketNo: {} }])('rejects malformed policy instead of enabling unlimited creation', value => {
    expect(() => parseTicketCreationPolicy(value)).toThrow('SUPPORT_TICKET_POLICY_INVALID');
  });
});
