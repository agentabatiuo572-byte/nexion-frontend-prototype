import type { HowContentBlock } from '@/api/how-content-api';
import type { DirectReferralRule } from '@/api/direct-referral-api';
import { buildCommissionsHowContent, type CommissionsHowSnapshot } from '@/lib/commissions-how-content';
import { formatGroupedAmount } from '@/lib/amount-display';
import { formatHowNumber } from '@/lib/rank-how-content';

// The existing summary substitutes several whole paragraphs. The full reader
// retains the publication's wording/order/items and resolves only its declared
// value slots, using the same accepted rule snapshot as that summary.
export function commissionPublishedBlocks(snapshot: CommissionsHowSnapshot, locale: string): HowContentBlock[] | null {
  const { copy } = buildCommissionsHowContent(snapshot, locale);
  const { directPolicy: policy, guide } = snapshot;
  const number = (value: number) => formatHowNumber(value, locale);
  const money = (value: number) => `${formatGroupedAmount(value)} USDT`;
  const describe = (rule: DirectReferralRule) => !policy.configured ? copy.notConfigured : !rule.enabled ? copy.paused
    : `${copy.totalRate} ${number(rule.totalRatePct)}% · ${copy.split}: USDT ${number(rule.usdtSharePct)}% / UVT ${number(100 - rule.usdtSharePct)}% · ${number(rule.coolingDays)} ${copy.days}`;
  let purchaseRules = describe(policy.purchase);
  if (policy.settlementMode === 'SEVEN_V2') {
    const split = policy.purchaseSplit, reference = policy.sevenLayerReference;
    purchaseRules = !policy.configured || !split || !reference || policy.purchaseSplitConfigured === false
      || reference.baseRatePct === null || reference.coolingDays === null ? copy.notConfigured
      : split.enabled ? `${copy.purchaseBudget} ${number(reference.baseRatePct)}% · ${copy.split}: USDT ${number(split.usdtSharePct)}% / UVT ${number(100 - split.usdtSharePct)}% · ${copy.purchaseReplacement}` : copy.purchaseOriginal;
  }
  const binary = guide.binary, leadership = guide.leadership;
  const ranks = snapshot.ranks.filter(row => row.visible).sort((a, b) => a.v - b.v);
  const cultivation = ranks.find(row => row.cultivationBonus > 0);
  const tokens: Record<string, string> = {
    directPurchaseRules: purchaseRules,
    networkPurchaseRules: copy.networkPurchase,
    directDeviceRules: describe(policy.deviceEarning),
    directScope: policy.settlementMode === 'SEVEN_V2' ? copy.deviceScope : copy.directOnly,
    directPrice: policy.nexUsdtPrice === null ? copy.priceUnavailable : `${number(policy.nexUsdtPrice)} USDT / UVT`,
    coolingDays: guide.coolingDays === null ? copy.missing : `${number(guide.coolingDays)} ${copy.days}`,
    // Same public wording as the summary: no caps or unmatched-volume handling (APP-COPY-AUDIT rule 6).
    binaryRules: binary ? `${copy.settlementPeriod}: ${copy[binary.settlePeriod]} · ${binary.paused ? copy.paused : copy.unpaused}` : copy.missing,
    peerRules: copy.records, cultivationRules: copy.cultivation,
    leadershipRules: leadership ? `${copy.minRank} V${leadership.minRank}` : copy.hold,
    leadershipVotes: leadership ? ranks.filter(row => row.v >= leadership.minRank).map(row => `V${row.v}: ${number(row.leadershipVotes)}`).join(' · ') : copy.hold,
    peerStatus: guide.capabilities.peer ? copy.supported : copy.unsupported,
    genesisStatus: guide.capabilities.genesis ? copy.supported : copy.unsupported,
    exampleBase: money(100), exampleRank: cultivation ? `V${cultivation.v}` : copy.none,
  };
  let unresolved = false;
  const resolve = (raw: string) => raw.replace(/\{([^{}]+)\}/g, (placeholder, key: string) => {
    if (Object.prototype.hasOwnProperty.call(tokens, key)) return tokens[key];
    unresolved = true;
    return placeholder;
  });
  const blocks = snapshot.document.blocks.map(block => ({ ...block, title: resolve(block.title), body: resolve(block.body),
    ...(block.items ? { items: block.items.map(resolve) } : {}) }));
  return unresolved ? null : blocks;
}
