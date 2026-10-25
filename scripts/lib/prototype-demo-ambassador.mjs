// Isolated prototype state. This module is never part of the production app.
const path = '/api/app/team/ambassador-applications';
const proof = { source: 'server', sourceEnvironment: 'PRODUCTION', runId: '' };
export function ambassadorDemo(url, state, request) {
  if (url.pathname !== path && url.pathname !== path + '/latest') return undefined;
  const now = new Date().toISOString();
  const current = () => state.ambassadorSubmission || (state.dataState !== 'empty' && state.ambassadorState && state.ambassadorState !== 'none'
    ? { ...proof, applicationId: 90001, status: state.ambassadorState.toUpperCase(), city: 'Hanoi', eventDate: '2026-11-15', budgetUsdt: 1000, bucket: 'venue', submittedAt: now }
    : { ...proof, applicationId: null, status: 'NONE' });
  if (request.method() === 'POST' && url.pathname === path) {
    const key = request.headers?.()['idempotency-key'] || request.headers?.()['Idempotency-Key'];
    if (key && state.ambassadorCommands?.[key]) return structuredClone(state.ambassadorCommands[key]);
    const reject = (message, status) => { throw Object.assign(new Error(message), { status }); };
    if (!state.highestRank) reject('DEMO_APPLICATION_RANK_REQUIRED', 403);
    if (current().status === 'PENDING') reject('AMBASSADOR_APPLICATION_PENDING', 409);
    const input = request.postDataJSON() || {};
    if (!['venue', 'kol', 'print', 'dev'].includes(input.bucket) || !/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate || '')
      || typeof input.city !== 'string' || !input.city.trim() || !Number.isFinite(input.budgetUsdt) || input.budgetUsdt < 100 || input.budgetUsdt > 10000) reject('DEMO_APPLICATION_INVALID', 400);
    const application = { ...proof, applicationId: 90001 + Object.keys(state.ambassadorCommands || {}).length, status: 'PENDING', city: input.city.trim(), eventDate: input.eventDate, budgetUsdt: input.budgetUsdt, bucket: input.bucket, submittedAt: now };
    state.ambassadorSubmission = application;
    if (key) { state.ambassadorCommands ??= {}; state.ambassadorCommands[key] = structuredClone(application); }
    return application;
  }
  if (request.method() !== 'GET') return undefined;
  const latest = current();
  if (url.pathname.endsWith('/latest')) return latest;
  const rows = latest.status === 'NONE' ? [] : [latest];
  return { ...proof, rows, pageNum: Number(url.searchParams.get('pageNum') || 1), pageSize: Number(url.searchParams.get('pageSize') || 50), total: rows.length, hasMore: false };
}
