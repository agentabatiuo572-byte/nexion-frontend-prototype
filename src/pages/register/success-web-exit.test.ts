import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import source from "./success.vue?raw";

function successExit(h5: boolean) {
  // Apply the same compile-time branches as UniApp before executing the actual
  // page function; raw source alone would execute both platform legs.
  const script = source.split('<script setup lang="ts">')[1].split("</script>")[0]
    .replace(/\/\/ #ifdef H5\r?\n([\s\S]*?)\/\/ #endif/g, (_all, body: string) => h5 ? body : "")
    .replace(/\/\/ #ifndef H5\r?\n([\s\S]*?)\/\/ #endif/g, (_all, body: string) => h5 ? "" : body);
  const ast = ts.createSourceFile("success.ts", script, ts.ScriptTarget.Latest, true);
  const exit = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "continueWeb");
  if (!exit) throw new Error("Missing registration success exit");
  const code = ts.transpileModule(`${exit.getText(ast)}\nreturn continueWeb;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const navReset = vi.fn();
  return { leave: new Function("navReset", code)(navReset) as () => void, navReset };
}

describe("registration success platform exit", () => {
  it.each([
    [true, "/pages/index/index"],
    [false, "/pages/onboarding/estimator"],
  ] as const)("H5=%s continues once to %s", (h5, expected) => {
    const { leave, navReset } = successExit(h5);
    leave();
    expect(navReset).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ url: expected }));
  });
});

describe("existing web download guide", () => {
  function loadGuide(h5: boolean, query: Record<string, string>) {
    const script = source.split('<script setup lang="ts">')[1].split("</script>")[0]
      .replace(/\/\/ #ifdef H5\r?\n([\s\S]*?)\/\/ #endif/g, (_all, body: string) => h5 ? body : "")
      .replace(/\/\/ #ifndef H5\r?\n([\s\S]*?)\/\/ #endif/g, (_all, body: string) => h5 ? "" : body);
    const ast = ts.createSourceFile("success.ts", script, ts.ScriptTarget.Latest, true);
    const load = ast.statements.find(node => ts.isExpressionStatement(node)
      && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === "onLoad");
    const gift = ast.statements.find(node => ts.isVariableStatement(node)
      && node.declarationList.declarations.some(d => d.name.getText(ast) === "giftState"));
    if (!load || !gift) throw new Error("Missing guide load or gift guard");
    const downloadOnly = { value: false };
    const remoteReceipt = { value: null as unknown };
    const consume = vi.fn(() => ({ giftStatus: "POSTED", giftUsdt: 10, giftNex: 20 }));
    const code = ts.transpileModule(`${load.getText(ast)}\n${gift.getText(ast)}\nreturn giftState;`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
    }).outputText;
    const giftState = new Function("onLoad", "downloadOnly", "setupOnly", "remoteReceipt", "auth", "consumeRemoteRegistrationReceipt", "computed", "remoteApiEnabled", code)(
      (callback: (options: Record<string, string>) => void) => callback(query), downloadOnly,
      { value: false }, remoteReceipt, { accountId: "user:42" }, consume, (fn: () => unknown) => ({ get value() { return fn(); } }), true,
    ) as { value: string };
    return { downloadOnly, consume, giftState };
  }
  it("download query renders guidance without consuming or claiming a registration gift", () => {
    const page = loadGuide(true, { download: "1", gift: "posted" });
    expect(page.downloadOnly.value).toBe(true);
    expect(page.consume).not.toHaveBeenCalled();
    expect(page.giftState.value).toBe("none");
  });
  it("normal H5 registration still consumes only the matching account receipt", () => {
    const page = loadGuide(true, {});
    expect(page.downloadOnly.value).toBe(false);
    expect(page.consume).toHaveBeenCalledExactlyOnceWith("user:42");
    expect(page.giftState.value).toBe("posted");
  });
  it("a download query does not grant native APP a web download mode", () => {
    const page = loadGuide(false, { download: "1" });
    expect(page.downloadOnly.value).toBe(false);
    expect(page.consume).toHaveBeenCalledExactlyOnceWith("user:42");
  });
});
