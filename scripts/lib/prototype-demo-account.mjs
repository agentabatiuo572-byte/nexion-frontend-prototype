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
}
