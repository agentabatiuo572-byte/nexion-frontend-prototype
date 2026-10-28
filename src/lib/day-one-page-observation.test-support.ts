import ts from "typescript";
import source from "./day-one-page-observation.ts?raw";
import { createDayOneObservationRecovery } from "./day-one-observation-recovery";
import { createAuthenticatedPageObservationReporter } from "./authenticated-page-observation";
import { runPassiveTabRead } from "./passive-tab-read";

// Execute the production adapter with an isolated, explicit frozen quest snapshot.
// The SFC fixtures still exercise their real handlers and all original assertions.
export function dayOnePageObservationFixture(reporter = createAuthenticatedPageObservationReporter()) {
  const quest = { remoteStatus: "ready", refreshRemote: async () => true,
    remoteQuests: ["visit_earn", "visit_store", "view_product_roi"].map(questCode =>
      ({ layer: "DAY_ONE", questCode, instanceKey: "DAY_ONE:component-fixture" })) };
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const modules: Record<string, unknown> = {
    "@/store/quest": { useQuest: () => quest },
    "./day-one-observation-recovery": { dayOneObservationRecovery: createDayOneObservationRecovery(reporter) },
    "./passive-tab-read": { runPassiveTabRead },
  };
  const exports = {} as typeof import("./day-one-page-observation");
  new Function("require", "exports", code)((id: string) => {
    if (!(id in modules)) throw new Error(`Unexpected day-one adapter import: ${id}`);
    return modules[id];
  }, exports);
  return exports;
}
