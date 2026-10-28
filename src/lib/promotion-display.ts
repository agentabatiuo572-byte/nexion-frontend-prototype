import { platformDisplayText } from "./brand-copy";
import { formatAmount } from "./amount-display";
import { formatDisplayDateTime } from "./display-date";
import type { LocalizedText, RewardState, PublicRewardSpec, RewardSpec } from '../api/promotion-contracts';
export function localized(value: LocalizedText | null | undefined, language: string): string { return value?.[language === 'zh' || language === 'vi' ? language : 'en'] ?? ''; }
/** Decimal string multiplication is display-only; eligibility and groups come from the server. */
export function rewardAmount(reward: PublicRewardSpec | RewardSpec, groups=1): string {
  if(reward.type==='DEVICE') return String(reward.quantity * groups);
  const [whole, fraction='']=reward.amount.split('.');
  const scaled=BigInt(whole+fraction.padEnd(6,'0'))*BigInt(groups);
  const raw=scaled.toString().padStart(7,'0');
  return formatAmount(raw.slice(0,-6)+'.'+raw.slice(-6));
}
export function rewardSummary(reward: PublicRewardSpec | RewardSpec, copy: {unknown:string;orderDiscount:string}, deviceName?:string|null, groups=1): string {
  const amount=rewardAmount(reward,groups);
  if(reward.type==='DEVICE')return (deviceName||copy.unknown)+' × '+amount;
  return reward.type==='DISCOUNT_USDT'?copy.orderDiscount+' · '+amount+' USDT':amount+' '+platformDisplayText(reward.type);
}
export function rewardStateKey(state: RewardState): 'rewardPending'|'rewardGranted'|'ready'|'processing'|'retrying'|'outcomeUnknown'|'rewardCancelled'|'rewardRevoking'|'reversed'|'review' {
  return ({PENDING:'rewardPending',READY:'ready',PROCESSING:'processing',ISSUED:'rewardGranted',RETRYABLE_FAILED:'retrying',OUTCOME_UNKNOWN:'outcomeUnknown',CANCELLED:'rewardCancelled',REVERSAL_PENDING:'rewardRevoking',REVERSED:'reversed',MANUAL_REVIEW:'review'} as const)[state];
}
export function displayDeadline(value: string, language: string): string {
  const date = formatDisplayDateTime(value, language, false, 0);
  return date === '—' ? date : `${date} · UTC`;
}
