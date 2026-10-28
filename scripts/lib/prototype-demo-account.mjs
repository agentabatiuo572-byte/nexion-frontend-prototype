// Loopback demonstration only; never imported into the production application.
export function accountDemo(url, locale, state, request) {
  const path = url.pathname;
  const method = request.method();
  const body = () => request.postDataJSON() || {};
  const reject = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
  const interval = 7 * 86400000;
  const nextChange = (changedAt) => changedAt && changedAt + interval > Date.now() ? changedAt + interval : null;
  if (path === '/api/app/profile') {
    state.profile ??= { nickname: 'Alex', avatarUrl: new URL('/static/img/demo/profile-woman.jpg', url).href, avatarRevision: 'demo-profile-woman', language: locale, nicknameChangedAt: null };
    if (method === 'PUT') {
      const update = body();
      if (!/^[A-Za-z]+ [A-Za-z]+ [1-9][0-9]$/.test(update.nickname || '')) reject('PROFILE_NICKNAME_INVALID', 400);
      if (state.profile.nickname === update.nickname) return { status: 'UNCHANGED', nickname: update.nickname };
      if (state.profile.nickname !== update.expectedNickname) reject('PROFILE_NICKNAME_CONFLICT');
      if (nextChange(state.profile.nicknameChangedAt)) reject('USER_NICKNAME_CHANGE_TOO_SOON');
      state.profile.nickname = update.nickname;
      state.profile.nicknameChangedAt = Date.now();
      return { status: 'UPDATED', nickname: update.nickname };
    }
    const { nicknameChangedAt, ...profile } = state.profile;
    return { ...profile, profileChangeIntervalDays: 7,
      nicknameChangeAvailableAt: nextChange(nicknameChangedAt), avatarChangeAvailableAt: null };
  }
  if (path === '/api/app/profile/language' && method === 'PUT') {
    const language = body().language;
    if (!['en','vi','zh','ja','ko','ru','es','pt','ar','de','fr'].includes(language)) reject('PROFILE_LANGUAGE_INVALID', 400);
    state.profile ??= { nickname: 'Alex', avatarUrl: new URL('/static/img/demo/profile-woman.jpg', url).href, avatarRevision: 'demo-profile-woman', language: locale, nicknameChangedAt: null };
    state.profile.language = language;
    return { status: 'UPDATED', language };
  }
}
