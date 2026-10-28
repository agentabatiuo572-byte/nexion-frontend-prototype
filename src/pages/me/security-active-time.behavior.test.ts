import ts from "typescript";
import { computed, ref } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import source from "./security.vue?raw";
import { parseServerTimestamp } from "@/api/server-time";
import { displayTimestamp } from "@/lib/display-date";
import { createAccountApi } from "@/api/account-api";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as vietnamese } from "@/i18n/messages/vi";

const now = Date.parse("2026-10-27T12:00:00Z");
const dictionaries = { en, zh, vi: vietnamese };
function setup(locale: keyof typeof dictionaries, lastActiveAt: unknown) {
  const script = source.split('<script setup lang="ts">')[1].split("</script>")[0];
  const parsed = ts.createSourceFile("security.ts", script, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const code = parsed.statements.filter(node =>
    ts.isVariableStatement(node)
      ? node.declarationList.declarations.some(declaration => ["sessions", "displaySessions"].includes(declaration.name.getText(parsed)))
      : ts.isFunctionDeclaration(node) && ["lastActiveLabel", "sessionSecondaryLabel"].includes(node.name?.text ?? ""),
  ).map(node => node.getText(parsed)).join("\n");
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const row = { id: "s1", deviceName: "Phone", ipMasked: "10.0.*.*", current: true, lastActiveAt };
  const remoteSecurity = ref<any>({ sessions: [row] });
  const securityPresentation = ref<any>({ sessions: [row] });
  const bag = { computed, remoteApiEnabled: true, remoteSecurity, securityPresentation,
    session: { activeSessions: [] }, nexGridBrandText: (s: string) => s,
    parseServerTimestamp, displayTimestamp, t: ref(dictionaries[locale]),
    fmt: (text: string, values: Record<string, number>) => text.replace("{n}", String(values.n)),
  };
  const page = new Function(...Object.keys(bag), `${js}; return { sessions, displaySessions, sessionSecondaryLabel, lastActiveLabel };`)(...Object.values(bag));
  return { ...page, remoteSecurity, securityPresentation };
}
afterEach(() => vi.restoreAllMocks());

it.each(["en", "zh", "vi"] as const)("keeps missing/invalid session ages unknown in both actual page mappings (%s)", locale => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  for (const value of [undefined, null, "", " ", "invalid", "2026-02-30T12:00:00", "2026-10-27T25:00:00Z", 0, now / 1000, now]) {
    const page = setup(locale, value);
    for (const list of [page.sessions, page.displaySessions]) {
      expect(list.value[0].lastActiveMs, String(value)).toBeNull();
      expect(page.sessionSecondaryLabel(list.value[0]), String(value)).toBe("10.0.*.* · —");
    }
  }
});

it.each(["en", "zh", "vi"] as const)("preserves zone parsing and translated relative age thresholds (%s)", locale => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  const copy = dictionaries[locale].security;
  for (const value of ["2026-10-27T19:53:00", "2026-10-27 19:53:00", "2026-10-27T11:53:00Z", "2026-10-27T20:53:00+09:00", "2026-10-27T07:53:00-04:00"]) {
    const page = setup(locale, value);
    expect(page.sessions.value[0].lastActiveMs).toBe(now - 7 * 60000);
    expect(page.sessionSecondaryLabel(page.displaySessions.value[0])).toBe(`10.0.*.* · ${copy.timeMinutesAgo.replace("{n}", "7")}`);
  }
  const page = setup(locale, "2026-10-27T12:00:00.123456789Z");
  expect(page.sessions.value[0].lastActiveMs).toBe(now + 123);
  for (const [age, expected] of [[0, copy.timeJustNow], [4 * 60000, copy.timeJustNow],
    [5 * 60000, copy.timeMinutesAgo.replace("{n}", "5")], [2 * 3600000, copy.timeHoursAgo.replace("{n}", "2")],
    [2 * 86400000, copy.timeDaysAgo.replace("{n}", "2")], [-3600000, copy.timeJustNow]] as const) {
    expect(page.lastActiveLabel(now - age)).toBe(expected);
  }
});

it.each(["2026-02-30T01:02:03", "2026-10-27", "2026-10-27T11:53Z"])("keeps API-accepted but unparseable activity unknown: %s", async value => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  const request = vi.fn().mockResolvedValue({ twoFactorEnabled: false, passwordChangedAt: null,
    sessions: [{ id: "s1", deviceName: "Phone", ipMasked: "10.0.*.*", current: true, lastActiveAt: value }] });
  const state = await createAccountApi({ request } as never).securityOverview();
  expect(state.sessions[0].lastActiveAt).toBe(value);
  expect(parseServerTimestamp(state.sessions[0].lastActiveAt)).toBeNull();
  const page = setup("en", state.sessions[0].lastActiveAt);
  page.remoteSecurity.value = state;
  page.securityPresentation.value = state;
  for (const list of [page.sessions, page.displaySessions]) {
    expect(page.sessionSecondaryLabel(list.value[0])).toBe("10.0.*.* · —");
    expect(list.value[0].lastActiveMs).toBeNull();
  }
});

it("retains valid epoch parsing while zero and invalid event display stay unknown", () => {
  vi.spyOn(Date, "now").mockReturnValue(now);
  expect(parseServerTimestamp("1970-01-01T00:00:00Z")).toBe(0);
  const page = setup("en", "1970-01-01T00:00:00Z");
  expect(page.sessions.value[0].lastActiveMs).toBe(0);
  expect(page.sessionSecondaryLabel(page.displaySessions.value[0])).toBe("10.0.*.* · —");
  for (const value of [null, 0, NaN, Infinity, -Infinity, 8.64e15 + 1]) expect(page.lastActiveLabel(value)).toBe("—");
  page.remoteSecurity.value = null;
  expect(page.sessions.value).toEqual([]);
  expect(page.sessionSecondaryLabel(page.displaySessions.value[0])).toBe("10.0.*.* · —");
  page.securityPresentation.value = null;
  expect(page.displaySessions.value).toEqual([]);
});

it.each([undefined, null, "", "invalid", 0, now / 1000, now])("continues rejecting malformed authoritative timestamps: %s", async value => {
  const request = vi.fn().mockResolvedValue({ twoFactorEnabled: false, passwordChangedAt: null,
    sessions: [{ id: "s1", deviceName: "Phone", ipMasked: "10.0.*.*", current: true, lastActiveAt: value }] });
  await expect(createAccountApi({ request } as never).securityOverview()).rejects.toMatchObject({ kind: "protocol", message: "SECURITY_RESPONSE_INVALID" });
});
