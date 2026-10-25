// Loopback demonstration only; never imported into the production application.
export function accountDemo(url, locale, state, request) {
  const path = url.pathname;
  const method = request.method();
  const body = () => request.postDataJSON() || {};
  const reject = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
  if (path === '/api/app/profile') {
    state.profile ??= { nickname: 'Alex', avatarUrl: '', avatarRevision: '', language: locale };
    if (method === 'PUT') {
      const update = body();
      if (!/^[A-Za-z]+ [A-Za-z]+ [1-9][0-9]$/.test(update.nickname || '')) reject('PROFILE_NICKNAME_INVALID', 400);
      if (state.profile.nickname === update.nickname) return { status: 'UNCHANGED', nickname: update.nickname };
      if (state.profile.nickname !== update.expectedNickname) reject('PROFILE_NICKNAME_CONFLICT');
      state.profile.nickname = update.nickname;
      return { status: 'UPDATED', nickname: update.nickname };
    }
    return { ...state.profile };
  }
  if (path === '/api/app/profile/language' && method === 'PUT') {
    const language = body().language;
    if (!['en','vi','zh','ja','ko','ru','es','pt','ar','de','fr'].includes(language)) reject('PROFILE_LANGUAGE_INVALID', 400);
    state.profile ??= { nickname: 'Alex', avatarUrl: '', avatarRevision: '', language: locale };
    state.profile.language = language;
    return { status: 'UPDATED', language };
  }
  if (path === '/api/app/compute-share/enrollments' && method === 'POST') {
    const requestedGpuModel = String(body().requestedGpuModel || '').trim().replace(/\s+/g, ' ');
    if (requestedGpuModel.length < 3 || requestedGpuModel.length > 128) reject('COMPUTE_SHARE_GPU_MODEL_INVALID', 400);
    const key = request.headers?.()['idempotency-key'];
    if (!key) reject('IDEMPOTENCY_KEY_REQUIRED', 400);
    state.pairingCommands ??= {};
    if (state.pairingCommands[key]) return { ...state.pairingCommands[key] };
    const enrollment = { enrollmentNo: 'CSE-DEMO' + (Object.keys(state.pairingCommands).length + 1), pairingCode: '482719', status: 'PENDING', requestedGpuModel, expiresAt: new Date(Date.now() + 600000).toISOString(), deviceId: null, source: 'server' };
    state.pairingCommands[key] = enrollment;
    return { ...enrollment };
  }
  if (path.startsWith('/api/app/compute-share/enrollments/') && method === 'GET') {
    const enrollmentNo = decodeURIComponent(path.split('/').pop());
    const enrollment = Object.values(state.pairingCommands || {}).find(row => row.enrollmentNo === enrollmentNo);
    if (!enrollment) reject('COMPUTE_SHARE_ENROLLMENT_NOT_FOUND', 404);
    const status = state.pairingState === 'connected' ? 'CONNECTED' : state.pairingState === 'expired' || Date.now() >= Date.parse(enrollment.expiresAt) ? 'EXPIRED' : 'PENDING';
    return { ...enrollment, status, pairingCode: status === 'PENDING' ? enrollment.pairingCode : null, deviceId: status === 'CONNECTED' ? 43 : null };
  }
}
