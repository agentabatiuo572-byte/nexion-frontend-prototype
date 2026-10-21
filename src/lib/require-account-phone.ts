import { remoteApiEnabled, sessionVault } from "@/api/runtime";
import { getT } from "@/i18n/use-t";
import { navTo } from "@/lib/route";
import { toast } from "@/store/ui";

/** Gate only actions that send an SMS to the current account's phone. */
export function requireAccountPhone(): boolean {
  if (!remoteApiEnabled) return true;
  const session = sessionVault.read();
  if (!session) return false;
  if (session.user.phone) return true;
  toast.warn(getT().security.phoneBindingRequired);
  void navTo("/pages/me/phone-binding");
  return false;
}
