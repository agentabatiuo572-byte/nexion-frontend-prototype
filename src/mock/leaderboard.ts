/**
 * Invite Leaderboard mock data — ported verbatim from
 * Nexion-prototype/lib/mock/leaderboard.ts (no React; already backend-replaceable).
 * 100 top inviters across 4 periods. Production: GET /api/leaderboard?period=…
 * returns the server-authoritative board; this seeded mock is display-only.
 *
 * Data is deterministic (mulberry32 seeded), so the list is identical every
 * render — no hydration concern (uni H5 is CSR anyway).
 */

export type LeaderPeriod = "today" | "week" | "month" | "all";

export interface LeaderEntry {
  rank: number;
  /** Anonymized handle, real platforms partially mask last chars */
  handle: string;
  /** Country flag emoji */
  flag: string;
  /** 2-letter country code (alt-text & filtering use) */
  cc: string;
  /** Direct referrals (level 1) */
  directs: number;
  /** Total team size (all 7 layers) */
  teamSize: number;
  /** Total commission earned in this period (USDT) */
  earnedUSDT: number;
  /** Rank delta vs previous snapshot (positive = climbing) */
  delta: number;
  /** V-rank badge level (V0-V12) */
  vRank: number;
  /** Verified hardware owner */
  hasDevice: boolean;
}

// deterministic PRNG (mulberry32)
function mulberry32(seed: number) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const HANDLES = [
  "Daniel_K", "Maria_S", "Ahmed_R", "Yuki_T", "Carlos_M", "Priya_S", "Lukas_F", "Mei_C",
  "Diego_P", "Anastasia_V", "Tomas_B", "Aisha_O", "Hiro_N", "Sofia_L", "Mehmet_A", "Hannah_W",
  "Rohit_K", "Camila_R", "Stefan_H", "Lin_W", "Olga_M", "Tariq_Z", "Elena_P", "Kenji_S",
  "Fatima_E", "Pavel_I", "Yuna_K", "Bruno_C", "Aiko_M", "Aleksei_V", "Nia_J", "Rafael_T",
  "Sara_L", "Dimitri_O", "Anh_T", "Marco_D", "Ines_C", "Tomek_R", "Aria_S", "Hassan_M",
  "Lena_F", "Khalid_N", "Yara_B", "Ruslan_K", "Maya_H", "Joon_P", "Luna_V", "Esteban_C",
  "Amara_O", "Igor_M", "Selin_E", "Naoto_F", "Aida_R", "Beatriz_A", "Mateo_G", "Nadia_S",
  "Viktor_L", "Pia_W", "Tarek_O", "Yelena_K", "Bruno_S", "Karim_E", "Hina_T", "Marek_J",
  "Carla_N", "Alvaro_P", "Jia_L", "Reza_M", "Tien_V", "Andrei_C", "Sana_H", "Ravi_P",
  "Linnea_O", "Vlad_R", "Mio_N", "Cesar_D", "Aiyana_M", "Filip_K", "Zara_B", "Ari_T",
  "Bilal_R", "Iva_H", "Theo_C", "Mira_S", "Khoa_N", "Daniela_P", "Jonas_M", "Tess_O",
  "Idris_K", "Lana_V", "Ravi_S", "Yael_M", "Aleks_B", "Nora_E", "Pietro_C", "Manon_R",
  "Adi_K", "Sami_F", "Zoe_T", "Eva_C",
];

const FLAGS: Array<[string, string]> = [
  ["🇺🇸", "US"], ["🇧🇷", "BR"], ["🇮🇳", "IN"], ["🇨🇳", "CN"], ["🇮🇩", "ID"], ["🇳🇬", "NG"],
  ["🇲🇽", "MX"], ["🇪🇬", "EG"], ["🇵🇭", "PH"], ["🇻🇳", "VN"], ["🇹🇷", "TR"], ["🇨🇴", "CO"],
  ["🇦🇪", "AE"], ["🇰🇷", "KR"], ["🇯🇵", "JP"], ["🇰🇿", "KZ"], ["🇿🇦", "ZA"], ["🇲🇾", "MY"],
  ["🇵🇰", "PK"], ["🇦🇷", "AR"], ["🇩🇪", "DE"], ["🇫🇷", "FR"], ["🇮🇹", "IT"], ["🇪🇸", "ES"],
  ["🇨🇦", "CA"], ["🇦🇺", "AU"], ["🇬🇧", "GB"], ["🇮🇷", "IR"], ["🇸🇦", "SA"], ["🇹🇭", "TH"],
];

function buildList(seed: number, multiplier: number, count = 100): LeaderEntry[] {
  const rng = mulberry32(seed);
  const out: LeaderEntry[] = [];
  for (let i = 0; i < count; i++) {
    const rank = i + 1;
    const handle = HANDLES[i % HANDLES.length];
    const [flag, cc] = FLAGS[Math.floor(rng() * FLAGS.length)];

    // Top earners taper hard (long-tail) — top 3 ~10x median
    const decay = Math.pow(0.965, i);
    const earnedUSDT = Math.round((90000 * decay + rng() * 1200) * multiplier);
    const directs = Math.max(3, Math.round(60 * decay + rng() * 18));
    const teamSize = directs * (35 + Math.floor(rng() * 25));
    const delta = Math.floor((rng() - 0.45) * 14);
    const vRank = Math.min(12, Math.max(2, 12 - Math.floor(i / 8) + Math.floor(rng() * 2)));
    const hasDevice = rng() > 0.18;

    out.push({ rank, handle, flag, cc, directs, teamSize, earnedUSDT, delta, vRank, hasDevice });
  }
  return out;
}

export const LEADERBOARD: Record<LeaderPeriod, LeaderEntry[]> = {
  today: buildList(7341, 0.03),
  week: buildList(11827, 0.21),
  month: buildList(22943, 1.0),
  all: buildList(91118, 18.7),
};

/** Period-specific prize-pool config — what real platforms anchor leaderboards with. */
export const PERIOD_PRIZE: Record<
  LeaderPeriod,
  { poolUSD: number; topN: number; resetsIn: string; label: string }
> = {
  today: { poolUSD: 5000, topN: 20, resetsIn: "08:42:11", label: "Daily" },
  week: { poolUSD: 50000, topN: 50, resetsIn: "3d 12h", label: "Weekly" },
  month: { poolUSD: 250000, topN: 100, resetsIn: "12d", label: "Monthly" },
  all: { poolUSD: 1000000, topN: 100, resetsIn: "—", label: "All-time" },
};

/** Hardware rewards for podium positions (real platforms ship branded merch).
 *  Medal colors are intrinsic gold/silver/bronze, not theme tokens. */
export const PODIUM_PRIZE = [
  { medal: "🥇", color: "#FFC83D", reward: "Genesis Node + Rack ×1" },
  { medal: "🥈", color: "#C9D2DC", reward: "NexGridBox Pro ×3" },
  { medal: "🥉", color: "#C77546", reward: "NexGridBox Pro ×1" },
];

/** My current rank (mock — would come from server) */
export const MY_RANK: Record<LeaderPeriod, { rank: number; gapToNext: number }> = {
  today: { rank: 237, gapToNext: 84 },
  week: { rank: 412, gapToNext: 1183 },
  month: { rank: 689, gapToNext: 2841 },
  all: { rank: 1247, gapToNext: 8902 },
};
