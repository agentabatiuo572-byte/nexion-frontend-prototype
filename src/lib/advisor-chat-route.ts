import { remoteApiEnabled } from "@/api/runtime";
import type { useConversations } from "@/store/conversations";

/** The advisor chat to open: the current advisor's thread when one exists, else a new conversation. */
export async function advisorChatRoute(convStore: ReturnType<typeof useConversations>): Promise<string> {
  if (remoteApiEnabled) await Promise.allSettled([convStore.refresh(), convStore.refreshAdvisor()]);
  const advisorId = convStore.advisor?.currentAdvisorId;
  const ongoing = advisorId ? convStore.humanThreads.find(row => row.ownerAgentId === String(advisorId)) : undefined;
  return ongoing ? "/pages/support/chat?cid=" + encodeURIComponent(ongoing.id) : "/pages/support/chat?start=advisor";
}
