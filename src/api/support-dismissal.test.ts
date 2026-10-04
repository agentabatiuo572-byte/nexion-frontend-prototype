import { describe, expect, it, vi } from 'vitest';
import { createSupportApi } from './support-api';
import { ApiError } from './errors';

describe('personal inbox API', () => {
  it('recognises an older server without suppressing auth or network errors', async () => {
    const request = vi.fn().mockRejectedValue(new ApiError({kind: 'http', status: 404, message: 'Not found'}));
    const api = createSupportApi({ request } as never);
    expect(await api.conversationDismissals()).toBeNull();
    request.mockRejectedValue(new ApiError({kind: 'auth', status: 401, message: 'Expired'}));
    await expect(api.conversationDismissals()).rejects.toThrow('Expired');
  });
  it('uses the authenticated support endpoint and displayed message boundary', async () => {
    const request = vi.fn(async () => ({ conversationNo: 'CV-1', throughMessageId: 12 }));
    const result = await createSupportApi({ request } as never).dismissConversation('CV-1', 11);
    expect(request).toHaveBeenCalledExactlyOnceWith({ method: 'POST', path: '/api/app/support/conversations/CV-1/dismiss', body: { throughMessageId: 11 } });
    expect(result.throughMessageId).toBe(12);
  });
  it.each([0, -1, Infinity, 1.5])('rejects invalid boundary %s before sending', async boundary => {
    const request = vi.fn(); await expect(createSupportApi({ request } as never).dismissConversation('CV-1', boundary)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
  it.each([{ conversationNo: 'OTHER', throughMessageId: 11 }, { conversationNo: 'CV-1', throughMessageId: 10 }])('rejects mismatched or regressing responses', async value => {
    const request = vi.fn(async () => value);
    await expect(createSupportApi({ request } as never).dismissConversation('CV-1', 11)).rejects.toThrow('SUPPORT_DISMISSAL_RESPONSE_INVALID');
  });
  it('loads persistent account markers without changing read receipts', async () => {
    const request = vi.fn(async () => [{ conversationNo: 'CV-1', throughMessageId: 11 }]);
    expect(await createSupportApi({ request } as never).conversationDismissals()).toHaveLength(1);
    expect(request).toHaveBeenCalledExactlyOnceWith({ method: 'GET', path: '/api/app/support/conversation-dismissals' });
  });
});
