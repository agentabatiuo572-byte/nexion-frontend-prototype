import { useQuest } from "@/store/quest";
import { dayOneObservationRecovery } from "./day-one-observation-recovery";
import type { AuthenticatedPageObservation } from "./authenticated-page-observation";
import { runPassiveTabRead } from "./passive-tab-read";
export async function reportDayOnePageObservation(
  questCode: string,
  input: Omit<AuthenticatedPageObservation<{ recorded: boolean }>, "subject" | "accepted" | "rejected">,
): Promise<void> {
  const quest = useQuest();
  if (quest.remoteStatus !== "ready") await runPassiveTabRead("quest", () => quest.refreshRemote(), undefined, () => quest.remoteStatus === "ready");
  if (!input.isCurrent(input.scope) || !input.visible()) return;
  const currentInstance = () => quest.remoteQuests.find(row => row.layer === "DAY_ONE" && row.questCode === questCode)?.instanceKey;
  const instanceKey = currentInstance();
  // An absent/unknown frozen task cannot be assigned a local recovery identity.
  if (!instanceKey) return;
  await dayOneObservationRecovery.report({ ...input, questCode, instanceKey, currentInstance });
}
