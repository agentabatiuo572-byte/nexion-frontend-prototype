import { businessCalendarApi, remoteApiEnabled } from "@/api/runtime";
import { setBusinessCalendar } from "./business-calendar";

const REFRESH_MS = 10 * 60_000;
let lastReadAt = 0;
let inFlight: Promise<void> | null = null;

/** Re-reads the business calendar at most every 10 minutes; a failed read keeps the last good calendar. */
export function refreshBusinessCalendar(now = Date.now()): Promise<void> {
  if (!remoteApiEnabled || inFlight || now - lastReadAt < REFRESH_MS) return inFlight ?? Promise.resolve();
  lastReadAt = now;
  inFlight = businessCalendarApi.read()
    .then((calendar) => { if (calendar) setBusinessCalendar(calendar); })
    .catch(() => undefined)
    .finally(() => { inFlight = null; });
  return inFlight;
}
