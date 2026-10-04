import { describe, expect, it } from "vitest";
import ts from "typescript";
import type { EarningsReleaseStatus } from "@/api/earnings-release-api";
import { fmt } from "@/i18n/format";

const page = (import.meta.glob("./wallet.vue", { query: "?raw", import: "default", eager: true })["./wallet.vue"]) as string;
const script = page.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)![1];
const source = ts.createSourceFile("wallet.ts", script, ts.ScriptTarget.Latest, true);
const fn = source.statements.find(s => ts.isFunctionDeclaration(s) && s.name?.text === "releaseSheetMessage")!;
const compiled = ts.transpileModule(fn.getText(source) + ";return releaseSheetMessage;", {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const wallet = {
  releaseDetailsUnavailable: "unavailable", pendingSheetEmpty: "no pending", lockedSheetEmpty: "no locked",
  pendingSheetBody: "pending server confirmation", lockedSheetBody: "locked server confirmation",
  releaseAttestationInfo: "requires {hours} hours; subject to server confirmation",
};
const base = (): EarningsReleaseStatus => ({
  buckets: { withdrawable: 0, pending_review: 0, bonus_locked: 0 }, assets: {},
  releaseMode: "attest_or_manual", attestedOnlineSeconds: 0, requiredAttestationSeconds: 7200,
  clusterRestricted: false, serverCanonical: true,
});
function setup(snapshot: EarningsReleaseStatus | null = base(), status = "ready") {
  const snapshotRef = { value: snapshot }, statusRef = { value: status };
  const message = new Function("earningsReleaseSnapshot", "earningsReleaseStatus", "t", "fmt", compiled)(
    snapshotRef, statusRef, { value: { wallet } }, fmt,
  ) as (route: "pending_review" | "bonus_locked") => string;
  return { message, snapshotRef, statusRef };
}

describe("actual wallet release explanation", () => {
  it("reports zero buckets without risk allegations or a release promise", () => {
    const { message } = setup();
    expect(message("pending_review")).toBe("no pending");
    expect(message("bonus_locked")).toBe("no locked");
  });
  it.each(["idle", "loading", "error"])("does not trust retained snapshots while %s", status => {
    expect(setup(base(), status).message("pending_review")).toBe("unavailable");
  });
  it("clears another account's explanation when the account-scoped store is rebound", () => {
    const s = setup();
    s.snapshotRef.value = null;
    s.statusRef.value = "idle";
    expect(s.message("bonus_locked")).toBe("unavailable");
  });
  it("uses the server's positive threshold only for eligible held funds", () => {
    const snapshot = base(); snapshot.buckets.pending_review = 12;
    const { message } = setup(snapshot);
    expect(message("pending_review")).toBe("pending server confirmation\nrequires 2 hours; subject to server confirmation");
    expect(message("bonus_locked")).toBe("no locked");
  });
  it.each(["manual", "restricted", "zero"])("omits online release expectations for %s", variant => {
    const snapshot = base(); snapshot.buckets.bonus_locked = 3;
    if (variant === "manual") snapshot.releaseMode = "manual_only";
    if (variant === "restricted") snapshot.clusterRestricted = true;
    if (variant === "zero") snapshot.requiredAttestationSeconds = 0;
    expect(setup(snapshot).message("bonus_locked")).toBe("locked server confirmation");
  });
  it("keeps local risk evaluation out of the wallet and refreshes the release receipt on show", () => {
    expect(page).not.toMatch(/evaluateAccountCluster|riskReasonSummary|appAttestationReleaseHours/);
    expect(page).toContain('message: releaseSheetMessage("pending_review")');
    expect(page).toContain('message: releaseSheetMessage("bonus_locked")');
    expect(page).toContain("void refreshEarningsReleaseStatus().catch(() => undefined)");
  });
});
