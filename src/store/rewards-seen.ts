import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { mockServerNow } from "./server-time";
import { useBills, isRewardBill } from "./bills";
import { normalizeAccountKey } from "./account-cloud";
import { readAccountRow, writeAccountRow } from "./account-scoped-storage";

/**
 * Rewards seen-watermark — the last time the user opened My Rewards
 * (/me/rewards). The Me-page entry shows an unread dot for reward credits
 * posted after this watermark (the voucher half of the dot is state-based
 * and lives in the voucher store, not here).
 *
 * Persistence: MOCK-ONLY local mirror (nexgrid-rewards-seen-v1). Real backend
 * owns the watermark on the user profile (`rewardsSeenAt`): the page open
 * fires PATCH /api/me/rewards/seen (server stamps the time — client clocks
 * are not trusted) and GET /api/users/me returns it. This store mirrors that exact
 * shape so cutover is a fetch swap; default 0 = everything unread, which is
 * the correct first-run behavior (seeded credits surface the page).
 */

// 旧设备级单键 "nexgrid-rewards-seen-v1" 废弃(存量无账号归属,mock 可重建);已读水位线按账号分行。
// 🔴 必按账号:hasUnseen 拿本水位线 vs 本账号 bills(已按账号)比;水位线跨账号继承会让红点错判。
const ACCOUNTS_KEY = "nexgrid-rewards-seen-accounts-v1"; // { [accountKey]: { seenAt: number } }

function hydrate(accountKey: string): number {
  const row = readAccountRow<{ seenAt?: number }>(ACCOUNTS_KEY, accountKey);
  if (row && typeof row.seenAt === "number") return row.seenAt;
  return 0;
}

export const useRewardsSeen = defineStore("rewards-seen", () => {
  // 账号维度:boot 期落 "default",账号确定后由 lib/account-scope 统一重绑。
  let boundKey = "default";
  const seenAt = ref<number>(hydrate(boundKey));
  const bills = useBills();

  /** Called when /me/rewards is shown — everything posted so far becomes read. */
  function markSeen(): void {
    seenAt.value = mockServerNow();
    writeAccountRow<{ seenAt: number }>(ACCOUNTS_KEY, boundKey, { seenAt: seenAt.value });
  }

  /** 账号切换重绑:装载该账号的已读水位线(与该账号 bills 单源比,防红点跨账号错判)。 */
  function bindAccount(rawAccountKey: string) {
    boundKey = normalizeAccountKey(rawAccountKey);
    seenAt.value = hydrate(boundKey);
  }

  /** Reward credits posted after the user last opened My Rewards. */
  const hasUnseen = computed(() => bills.bills.some((b) => isRewardBill(b) && b.ts > seenAt.value));

  return { seenAt, markSeen, hasUnseen, bindAccount };
});
