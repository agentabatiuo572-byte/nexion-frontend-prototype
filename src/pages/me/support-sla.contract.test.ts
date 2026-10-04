// @ts-expect-error Vitest runs this structural contract in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hub = readFileSync(new URL("./support.vue", import.meta.url), "utf8");
const tickets = readFileSync(new URL("./support-tickets.vue", import.meta.url), "utf8");
const api = readFileSync(new URL("../../api/support-api.ts", import.meta.url), "utf8");
const me = readFileSync(new URL("./me.vue", import.meta.url), "utf8");

describe("support SLA presentation contract", () => {
  it("does not present static presence or response averages as operational facts", () => {
    expect(hub).not.toContain("onlineNow");
    expect(hub).not.toContain('avgResponse, { n: "4" }');
    expect(tickets).not.toContain("avgResponseValue");
    expect(me).not.toContain("liveSupportRow");
    expect(me).not.toContain("onlineChip");
  });

  it("reads M4 targets and labels targets separately from unavailable statistics", () => {
    expect(api).toContain("slaTargets");
    expect(tickets).toContain("supportApi.slaTargets()");
    expect(tickets).toContain("slaTargetLabel");
    expect(tickets).toContain("slaStatisticsUnavailable");
  });

  it("keeps every server-supported ticket category selectable from the App", () => {
    expect(tickets).toContain('"withdrawal", "deposit", "hardware", "account", "earnings", "genesis", "technical", "other"');
  });
});
