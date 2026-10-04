import { describe, expect, it, vi } from "vitest";
import type { AppHomeEarningsLedgerRow } from "@/api/app-home-api";
import componentSource from "./live-feed-card.vue?raw";
import { buildCanonicalHomeFeed, formatHomeFeedTime } from "./home-live-feed";

const ledger: AppHomeEarningsLedgerRow[] = [
  {
    id: "receipt-old",
    client: "Pocket Studios",
    model: "SDXL Turbo",
    rewardUsdt: 0.00032,
    completedAt: "2026-08-21T02:00:00Z",
    synthetic: false,
  },
  {
    id: "receipt-new",
    client: "Helix Labs",
    model: "Llama 3.2 3B",
    rewardUsdt: 0.247,
    completedAt: "2026-08-21T03:00:00Z",
    synthetic: false,
  },
];

describe("home canonical live feed", () => {
  it("keeps local HH:mm when native time formatting ignores locale options", () => {
    const nativeTime = vi.spyOn(Date.prototype, "toLocaleTimeString")
      .mockReturnValue("16:34:40 GMT+0900 (JST)");
    try {
      expect(formatHomeFeedTime(new Date(2026, 9, 3, 16, 34, 40).toISOString())).toBe("16:34");
      expect(formatHomeFeedTime(new Date(2026, 9, 3, 0, 7, 40).toISOString())).toBe("00:07");
    } finally {
      nativeTime.mockRestore();
    }
  });

  it("uses a placeholder for missing or invalid completion times", () => {
    for (const completedAt of [undefined, null, "", "not-a-date"]) {
      expect(formatHomeFeedTime(completedAt)).toBe("—");
    }
  });

  it("projects the same settled receipt facts into activity and earnings tabs", () => {
    expect(buildCanonicalHomeFeed(ledger)).toEqual({
      activityRows: [
        {
          id: "receipt-new",
          client: "Helix Labs",
          model: "Llama 3.2 3B",
          rewardUsdt: 0.247,
          completedAt: "2026-08-21T03:00:00Z",
        },
        {
          id: "receipt-old",
          client: "Pocket Studios",
          model: "SDXL Turbo",
          rewardUsdt: 0.00032,
          completedAt: "2026-08-21T02:00:00Z",
        },
      ],
      earningsItems: [
        {
          id: "receipt-new",
          client: "Helix Labs",
          model: "Llama 3.2 3B",
          amountUsdt: 0.247,
          completedAt: "2026-08-21T03:00:00Z",
        },
        {
          id: "receipt-old",
          client: "Pocket Studios",
          model: "SDXL Turbo",
          amountUsdt: 0.00032,
          completedAt: "2026-08-21T02:00:00Z",
        },
      ],
    });
  });

  it("limits both views consistently without mutating the API snapshot", () => {
    const source = ledger.slice().reverse();
    const before = source.map((row) => row.id);

    const result = buildCanonicalHomeFeed(source, 1);

    expect(result.activityRows.map((row) => row.id)).toEqual(["receipt-new"]);
    expect(result.earningsItems.map((row) => row.id)).toEqual(["receipt-new"]);
    expect(source.map((row) => row.id)).toEqual(before);
  });

  it("keeps the real-data empty state empty", () => {
    expect(buildCanonicalHomeFeed([])).toEqual({ activityRows: [], earningsItems: [] });
  });

  it("keeps the formal dual-tab component canonical and isolates prototype mock data", () => {
    expect(componentSource).toContain('data-feed-mode="CANONICAL"');
    expect(componentSource).toContain("app.homeTruth?.earningsLedger ?? []");
    expect(componentSource).toContain('ariaControls: "home-live-feed-panel-activity"');
    expect(componentSource).toContain('ariaControls: "home-live-feed-panel-earnings"');
    expect(componentSource).toContain('<GlassSegments');
    expect(componentSource).toContain('v-model="tab"');
    expect(componentSource).toContain(':options="feedTabOptions"');
    expect(componentSource).not.toContain("function tabStyle(");
    expect(componentSource).not.toContain("remoteApiEnabled");
    expect(componentSource).not.toContain("FEED_POOL");
    expect(componentSource).not.toContain("setInterval");
  });
});
