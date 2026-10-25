// Isolated preview override. Never import this module from production src.
import { fixture as reviewFixture } from './design-review-fixture.mjs';

/**
 * If demoFixture already customizes the platform response, preserve that work:
 *   return withDemoShareChannels(data, state);
 * Otherwise call before demoFixture's fallback:
 *   const share = demoShareOverride(url, locale, state, request);
 *   if (share !== undefined) return share;
 *
 * Only GET /api/config/platform is handled. Existing share base, download
 * metadata and all unrelated platform fields remain the review fixture's.
 * Copy and poster are local actions; system is filtered by actual client
 * support. No external-channel send or share-event receipt is simulated.
 * Empty data exercises recovery. HTTP error/latency injection belongs to the
 * preview server (include this GET in its error/loading route selection).
 */
export function demoShareOverride(url, locale, state, request) {
  if (url.pathname !== '/api/config/platform' || (request?.method?.() ?? 'GET') !== 'GET') return undefined;
  const platform = reviewFixture(url, locale, state, request);
  return withDemoShareChannels(platform, state);
}

// Pure response transform: does not replace a caller's base URL, reward rules,
// platform flags or download metadata. Core UI actions also work without it.
export function withDemoShareChannels(platform, state) {
  return {
    ...platform,
    share: {
      ...platform.share,
      channels: state.dataState === 'empty' ? [] : [
        { key: 'copy', intentType: 'copy', enabled: true },
        { key: 'poster', intentType: 'poster', enabled: true },
        { key: 'system', intentType: 'system', enabled: true },
      ],
    },
  };
}
