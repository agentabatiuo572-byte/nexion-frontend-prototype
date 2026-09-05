// Nickname constructor — the only source of display names since the
// content-governance change (2026-07-15): free-text input was removed, so
// names can only be composed from these curated pools (violations are
// structurally impossible; no moderation pipeline needed).
// Real backend: GET /profile/nickname-candidates → string[] (same shape);
// this module is the mock stand-in (backend-replaceable).

const ADJECTIVES = [
  "Nova", "Swift", "Quantum", "Nebula", "Cosmic", "Prime", "Turbo", "Photon",
  "Zenith", "Atlas", "Vector", "Ember", "Lunar", "Solar", "Hyper", "Astro",
];
// 词库刻意避开产品业务词(Node/Genesis/Trial 等),防昵称与设备/节点术语同屏混淆。
const NOUNS = [
  "Rover", "Pilot", "Falcon", "Orbit", "Beacon", "Circuit", "Vertex", "Pulse",
  "Ranger", "Comet", "Relay", "Spark", "Drift", "Core", "Harbor", "Summit",
];

function compose(adjIdx: number, nounIdx: number, num: number): string {
  return `${ADJECTIVES[adjIdx]} ${NOUNS[nounIdx]} ${num}`;
}

export function generateNickname(): string {
  return compose(
    Math.floor(Math.random() * ADJECTIVES.length),
    Math.floor(Math.random() * NOUNS.length),
    10 + Math.floor(Math.random() * 90),
  );
}

/** 一批不重复候选（默认 6 个），供昵称选择 sheet 展示。 */
export function generateNicknameCandidates(count = 6): string[] {
  const seen = new Set<string>();
  while (seen.size < count) seen.add(generateNickname());
  return [...seen];
}

/** 账号 key 确定性派生默认昵称：同账号每次 hydrate 相同，不同账号大概率不同。 */
export function defaultNickname(accountKey: string): string {
  let h = 5381;
  for (let i = 0; i < accountKey.length; i++) h = (h * 33) ^ accountKey.charCodeAt(i);
  h = h >>> 0;
  // 全部用无符号移位:>> 会把 >2^31 的 hash 重新解释成负数 → 负索引出 undefined。
  return compose(h % ADJECTIVES.length, (h >>> 4) % NOUNS.length, 10 + ((h >>> 8) % 90));
}
