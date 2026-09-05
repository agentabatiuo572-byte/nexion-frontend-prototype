/**
 * Sponsor pool — shared between /ref/[code] landing and /register sponsor
 * confirmation card. Picks a stable sponsor for any given referral code
 * via a tiny hash so the same shared link always shows the same sponsor.
 */

export interface SponsorMeta {
  name: string;
  vRank: number;
  title: string;
  city: string;
  downlines: number;
}

const SPONSORS: SponsorMeta[] = [
  { name: "Sarah K.",  vRank: 5, title: "Wing Leader",  city: "Berlin",    downlines: 87 },
  { name: "Tom Wang",  vRank: 4, title: "Commander",    city: "Singapore", downlines: 42 },
  { name: "Lisa Park", vRank: 5, title: "Wing Leader",  city: "Seoul",     downlines: 124 },
  { name: "Carlos R.", vRank: 6, title: "Squadron",     city: "Madrid",    downlines: 268 },
  { name: "Yuki H.",   vRank: 4, title: "Commander",    city: "Tokyo",     downlines: 56 },
];

export function pickSponsor(code: string): SponsorMeta {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return SPONSORS[h % SPONSORS.length];
}
