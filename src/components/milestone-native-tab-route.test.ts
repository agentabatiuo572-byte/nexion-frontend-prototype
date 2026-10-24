import ts from "typescript";
import { expect, it, vi } from "vitest";
import source from "./milestone-celebration.vue?raw";
import { logicalNativePage, registerNativeTabHost, tabLocation } from "@/lib/native-tab-navigation";

it("keeps the home visit celebration limit in the shell without applying it to a child page", () => {
  const host = { route: "pages/tabs/tabs", $page: { id: 1 } };
  let location = tabLocation("/pages/index/index")!;
  let pages: Array<{ route: string; $page?: { id: number } }> = [host];
  vi.stubGlobal("getCurrentPages", () => pages);
  const unregister = registerNativeTabHost({ page: host, location: () => location, select: value => { location = value; } });
  const code = ts.transpileModule(source.slice(source.indexOf("function readRoute()"), source.indexOf("let advTimer:")), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const advance = vi.fn(), arbiter = { visitClaimed: true, busyForOthers: () => false, release: vi.fn() };
  const pump = new Function("logicalNativePage", "m", "arbiter", "voucherClaimSheet", "trialClaimSheet", code + "\nreturn pumpCelebrationQueue;")(
    logicalNativePage, { advance }, arbiter, { open: false }, { open: false },
  );
  pump(); expect(advance).toHaveBeenLastCalledWith("pages/index/index", true);
  location = tabLocation("/pages/me/me")!;
  pump(); expect(advance).toHaveBeenLastCalledWith("pages/me/me", false);
  pages = [host, { route: "pages/me/wallet" }];
  pump(); expect(advance).toHaveBeenLastCalledWith("pages/me/wallet", false);
  unregister(); vi.unstubAllGlobals();
});
