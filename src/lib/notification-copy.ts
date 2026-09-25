import type { Messages } from "@/i18n/messages/en";
import type { Notification } from "@/store/notifications";

/** Old local simulator notices retain their IDs, read state and destination, but
 * must not keep obsolete reward formulas in either notification surface. */
export function notificationCopy(item: Notification, words: Messages, remote: boolean): Notification {
  if (remote || !/^(team|staking|market)_\//.test(item.id)) return item;
  const titles = {
    commission: words.notifs.kindMoney, team: words.notifs.kindTeam,
    staking: words.notifs.kindStaking, market: words.notifs.kindMarket,
    genesis: words.notifs.kindGenesis, system: words.notifs.kindSystem,
  };
  return { ...item, title: titles[item.kind], body: words.publicCopy.experienceMode,
    ctaLabel: item.ctaHref ? words.store.viewDetails : undefined };
}
