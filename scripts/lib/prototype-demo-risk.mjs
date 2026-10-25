// Non-binding loopback sample. The real disclosure store and reading gate remain unchanged.
import { randomUUID } from 'node:crypto';
import { auxiliaryDemo } from './prototype-demo-auxiliary.mjs';

export function riskDemo(url, locale, state, request) {
  const currentPath = '/api/legal/risk-disclosure/current';
  const acknowledgmentPath = '/api/legal/risk-disclosure/acknowledgment';
  if (![currentPath, acknowledgmentPath].includes(url.pathname)) return undefined;
  const now = Date.now();
  const base = auxiliaryDemo(new URL(currentPath, url.origin), locale, state, { method: () => 'GET' });
  state.riskDemo ??= { token: randomUUID(), issuedAt: now, accepted: state.riskState !== 'unread' };
  const sample = state.riskDemo;
  if (url.pathname === acknowledgmentPath && request.method() === 'POST') {
    const body = request.postDataJSON() || {};
    if (body.confirmed !== true || body.jurisdiction !== base.jurisdiction || body.version !== base.version
      || body.acknowledgmentToken !== sample.token || now - sample.issuedAt < base.minimumReadingSeconds * 1000
      || now - sample.issuedAt > 300000) {
      throw Object.assign(new Error('DEMO_READING_REQUIRED'), { status: 409 });
    }
    sample.accepted = true;
    sample.acceptedAt = new Date(now).toISOString();
  }
  return { ...base, acknowledged: sample.accepted, acknowledgedAt: sample.accepted ? sample.acceptedAt || base.acknowledgedAt : null,
    acknowledgmentToken: sample.accepted ? null : sample.token,
    acknowledgmentTokenExpiresAt: sample.accepted ? null : new Date(sample.issuedAt + 300000).toISOString() };
}
