// Route → headerTitles i18n key resolver for the shared SubPageHeader.
//
// Mirrors the prototype Nexion-prototype/app/components/header.tsx
// getHeaderTitleKey(pathname) + computeTitle (how-it-works suffix). The prototype
// maps a NESTED web pathname ("/me/wallet/bills") to a headerTitles key; uni
// flattens those routes ("pages/me/wallet-bills"), so this resolver is keyed by
// the uni flat route taken from getCurrentPages() last entry `.route`.
//
// Parity rule (from the prototype): a route NOT in the map returns null → the
// header shows no title (the .spv-title v-if simply doesn't render), exactly like
// the prototype returning "" for unmapped routes.

import type { Messages } from "@/i18n/messages/en";

type HeaderTitleKey = keyof Messages["headerTitles"];

// uni flat route (no leading slash, as returned by getCurrentPages().route) →
// headerTitles key. Only keys that actually exist in headerTitles are listed.
// Tab roots (index/earn/store/team/me) are intentionally absent: those render the
// brand row via the chassis, never a SubPageHeader.
const ROUTE_TITLE_KEY: Record<string, HeaderTitleKey> = {
  // Top-level routes
  "pages/market/market": "market",
  "pages/missions/missions": "missions",
  "pages/events/events": "events",
  "pages/daily/daily": "daily",
  "pages/staking/staking": "staking",
  "pages/genesis/genesis": "genesis",
  "pages/search/search": "search",
  "pages/globe/globe": "globe",
  "pages/developer/developer": "developer",
  "pages/trust/trust": "trust",
  // Me subtree (flattened: /me/wallet/bills → pages/me/wallet-bills)
  "pages/me/wallet": "meWallet",
  "pages/me/wallet-topup": "meWalletTopup",
  "pages/me/wallet-withdraw": "meWalletWithdraw",
  "pages/me/wallet-withdraw-tracking": "meWalletWithdrawTracking",
  "pages/me/wallet-exchange": "meWalletExchange",
  "pages/me/wallet-bills": "meWalletBills",
  "pages/me/wallet-nex": "meWalletNex",
  "pages/me/wallet-repurchase": "meWalletRepurchase",
  "pages/me/profile": "meProfile",
  "pages/me/security": "meSecurity",
  "pages/me/help": "meHelp",
  "pages/me/support": "meSupport",
  "pages/me/support-tickets": "meSupportTickets",
  "pages/me/notifications": "meNotifications",
  "pages/me/receipts": "meReceipts",
  "pages/me/preferences": "mePreferences",
  "pages/me/achievements": "meAchievements",
  "pages/me/proof": "meProof",
  "pages/me/language": "meLanguage",
  "pages/me/goals": "meGoals",
  "pages/me/risk-disclosure": "meRiskDisclosure",
  // Team subtree
  "pages/team/rank": "teamRank",
  "pages/team/unilevel": "teamUnilevel",
  "pages/team/binary": "teamBinary",
  "pages/team/network": "teamNetwork",
  "pages/team/tree": "teamTree",
  "pages/team/leadership-pool": "teamLeadershipPool",
  "pages/team/commissions": "teamCommissions",
  "pages/team/leaderboard": "teamLeaderboard",
  "pages/team/quota": "teamQuota",
  "pages/team/agent": "teamAgent",
  // Genesis subtree
  "pages/genesis/marketplace": "genesisMarketplace",
  "pages/genesis/holder": "genesisHolder",
  // Trust subtree
  "pages/trust/nex": "trustNex",
};

// How-it-works pages append headerTitles.howItWorksSuffix to the PARENT title.
// uni has two flavours:
//   · separate segment: pages/genesis/how-it-works, pages/staking/how-it-works
//   · "-how" suffix on the leaf: pages/team/rank-how, pages/me/wallet-exchange-how
// Map each how-it-works route to the parent route whose key we reuse.
const HOW_IT_WORKS_PARENT: Record<string, string> = {
  "pages/genesis/how-it-works": "pages/genesis/genesis",
  "pages/staking/how-it-works": "pages/staking/staking",
  "pages/team/rank-how": "pages/team/rank",
  "pages/team/unilevel-how": "pages/team/unilevel",
  "pages/team/binary-how": "pages/team/binary",
  "pages/team/commissions-how": "pages/team/commissions",
  "pages/team/leadership-pool-how": "pages/team/leadership-pool",
  "pages/me/wallet-exchange-how": "pages/me/wallet-exchange",
  "pages/me/wallet-repurchase-how": "pages/me/wallet-repurchase",
};

export interface ResolvedTitle {
  /** headerTitles key for the base/parent title (null when route is unmapped). */
  key: HeaderTitleKey | null;
  /** True when the route is a how-it-works page → append howItWorksSuffix. */
  howItWorks: boolean;
}

/**
 * Resolve a uni flat route (e.g. "pages/me/wallet-bills") to its headerTitles
 * key, mirroring the prototype getHeaderTitleKey + how-it-works handling.
 * Unmapped routes return { key: null, howItWorks: false } → no title (prototype
 * parity: unmapped = "").
 */
export function resolveHeaderTitle(uniRoute: string): ResolvedTitle {
  // Normalise: drop any leading slash and query string defensively.
  const route = uniRoute.replace(/^\//, "").split("?")[0];

  const howParent = HOW_IT_WORKS_PARENT[route];
  if (howParent) {
    return { key: ROUTE_TITLE_KEY[howParent] ?? null, howItWorks: true };
  }

  // Tx subtree: prototype maps any "/tx/*" to the "tx" key. uni flattens to
  // pages/tx/<hash>; match the directory.
  if (route.startsWith("pages/tx/")) {
    return { key: "tx", howItWorks: false };
  }

  return { key: ROUTE_TITLE_KEY[route] ?? null, howItWorks: false };
}

/**
 * Resolve a uni flat route directly to the displayable title string.
 * Returns "" for unmapped routes (prototype parity). howItWorks pages return
 * parentTitle + howItWorksSuffix.
 */
export function resolveHeaderTitleText(
  uniRoute: string,
  headerTitles: Messages["headerTitles"],
): string {
  const { key, howItWorks } = resolveHeaderTitle(uniRoute);
  if (!key) return "";
  const base = headerTitles[key];
  return howItWorks ? base + headerTitles.howItWorksSuffix : base;
}
