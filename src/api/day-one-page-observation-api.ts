import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface DayOnePageObservationApi {
  earnPage(): Promise<DayOnePageObservationResult>;
  storePage(): Promise<DayOnePageObservationResult>;
  s1Roi(): Promise<DayOnePageObservationResult>;
}

export interface DayOnePageObservationResult {
  recorded: boolean;
}

function accepted(value: unknown): DayOnePageObservationResult {
  if (!value || typeof value !== "object" || (value as { accepted?: unknown }).accepted !== true) {
    throw new ApiError({ kind: "protocol", message: "DAY_ONE_PAGE_OBSERVATION_RESPONSE_INVALID" });
  }
  if (typeof (value as { recorded?: unknown }).recorded !== "boolean") {
    throw new ApiError({ kind: "protocol", message: "DAY_ONE_PAGE_OBSERVATION_RESPONSE_INVALID" });
  }
  return { recorded: (value as { recorded: boolean }).recorded };
}

/** Fixed read-only surfaces; no caller can choose a task code or reward. */
export function createDayOnePageObservationApi(client: ApiClient): DayOnePageObservationApi {
  const observe = async (surface: "earn" | "store" | "s1-roi"): Promise<DayOnePageObservationResult> => {
    return accepted(await client.request<unknown>({
      method: "POST",
      path: `/api/growth/day-one/page-observations/${surface}`,
      authenticated: true,
    }));
  };
  return {
    earnPage: () => observe("earn"),
    storePage: () => observe("store"),
    s1Roi: () => observe("s1-roi"),
  };
}
