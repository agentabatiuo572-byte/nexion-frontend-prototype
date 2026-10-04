import { assertDirectPageCoverage, collectDirectPageWitness } from "./probe-coverage.mjs";
import { collectAppConsoleErrors } from "./console-origin-filter.mjs";

export function captureTapRouteErrors(page, baseUrl) {
  const errors = { consoleErrors: [], pageErrors: [] };
  page.on("console", collectAppConsoleErrors(errors.consoleErrors, baseUrl));
  page.on("pageerror", error => errors.pageErrors.push(String(error)));
  return errors;
}

async function witnessWithErrors(page, errors) {
  return { ...await collectDirectPageWitness(page),
    consoleErrors: [...(errors?.consoleErrors ?? [])],
    pageErrors: [...(errors?.pageErrors ?? [])] };
}

// The requested page must be present before and after measurement.
// Login/Terms redirects cannot stand in for business pages.
export async function measureTapRoute(page, route, measure, errors) {
  const expected = `/${route.replace(/^\/+/, "")}`;
  const before = await witnessWithErrors(page, errors);
  assertDirectPageCoverage(expected, before, `tap-feedback ${route} before measurement`);
  const result = await measure();
  const after = await witnessWithErrors(page, errors);
  assertDirectPageCoverage(expected, after, `tap-feedback ${route} after measurement`);
  if (!result.targets?.length) {
    throw new Error(`tap-feedback ${route} has zero tap targets; page coverage is unproven`);
  }
  return { ...result, route, coverage: { before, after } };
}
