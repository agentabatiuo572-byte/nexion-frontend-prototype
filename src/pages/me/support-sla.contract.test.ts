// @ts-expect-error Vitest runs this structural contract in Node.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hub = readFileSync(new URL("./support.vue", import.meta.url), "utf8");
const api = readFileSync(new URL("../../api/support-api.ts", import.meta.url), "utf8");
const me = readFileSync(new URL("./me.vue", import.meta.url), "utf8");

describe("support SLA presentation contract", () => {
  it("does not present static presence or response averages as operational facts", () => {
    expect(hub).not.toContain("onlineNow");
    expect(hub).not.toContain('avgResponse, { n: "4" }');
    expect(me).not.toContain("liveSupportRow");
    expect(me).not.toContain("onlineChip");
  });

  it("does not read retired ticket SLA targets", () => {
    expect(api).not.toContain("slaTargets");
    expect(api).not.toContain("/sla-targets");
  });
});
