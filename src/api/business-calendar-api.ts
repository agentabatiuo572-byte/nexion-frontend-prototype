import type { ApiClient } from "./api-client";
import { parseBusinessCalendar, type BusinessCalendarTracks } from "@/lib/business-calendar";

/** D-16: public read of the business calendar; null when the payload is not a complete calendar. */
export function createBusinessCalendarApi(client: ApiClient) {
  return {
    read: async (): Promise<BusinessCalendarTracks | null> => parseBusinessCalendar(await client.request({
      method: "GET", path: "/api/config/business-calendar", authenticated: false,
    })),
  };
}
