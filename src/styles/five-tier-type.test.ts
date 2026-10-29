import ts from "typescript";
import { expect, it } from "vitest";

// Source of truth: uvel-docs design-system/10-responsive-type.md §10.1 (tokens.json responsiveTypography).
// Each row is [size, line-height] for the 320 / 360 / 375 / 390 / 430 bands.
const TABLE: Record<string, [number, number][]> = {
  "page-title": [[20, 28], [22, 30], [23, 31], [24, 32], [24, 32]],
  section: [[16, 24], [16, 24], [17, 24], [17, 24], [17, 24]],
  body: [[13, 20], [14, 21], [14, 21], [15, 22], [15, 22]],
  "list-title": [[13, 18], [14, 20], [15, 20], [15, 20], [15, 20]],
  "list-subtitle": [[12, 16], [12, 16], [13, 18], [13, 18], [13, 18]],
  "message-title": [[12.5, 18], [13, 18], [13.5, 19], [14, 20], [14, 20]],
  "message-preview": [[12, 17], [12, 17], [12.5, 18], [12.5, 18], [13, 19]],
  "message-meta": [[12, 16], [12, 16], [12, 16], [12, 16], [12, 16]],
  meta: [[12, 16], [12, 16], [12, 16], [12, 16], [12, 16]],
  profile: [[18, 24], [19, 26], [20, 28], [20, 28], [20, 28]],
  button: [[13, 18], [14, 20], [15, 20], [15, 20], [15, 20]],
  "long-form": [[14, 21], [14, 21], [14, 21], [15, 22], [15, 22]],
  input: [[16, 24], [16, 24], [16, 24], [16, 24], [16, 24]],
  "wallet-amount": [[30, 36], [32, 38], [34, 40], [36, 44], [36, 44]],
  "nav-title": [[14, 20], [14, 20], [15, 20], [15, 20], [16, 22]],
  "display-title": [[22, 30], [24, 32], [25, 33], [26, 34], [26, 34]],
  "hero-title": [[18, 26], [19, 26], [20, 28], [20, 28], [20, 28]],
  "card-title": [[15, 22], [15, 22], [16, 22], [16, 22], [16, 22]],
  subheading: [[14, 21], [15, 22], [15, 22], [15, 22], [15, 22]],
  "guide-body": [[13, 21], [14, 22], [14, 22], [14, 22], [14, 22]],
  description: [[12, 18], [12, 18], [13, 20], [13, 20], [13, 20]],
  note: [[12, 18], [12, 18], [12, 18], [12, 18], [12, 18]],
  "metric-value": [[16, 22], [17, 23], [18, 24], [18, 24], [18, 24]],
  "compact-button": [[13, 18], [13, 18], [13, 18], [13, 18], [13, 18]],
  chip: [[12, 16], [12, 16], [12, 16], [12, 16], [12, 16]],
  "text-link": [[13, 18], [13, 18], [13, 18], [13, 18], [13, 18]],
  segment: [[13, 18], [13, 18], [14, 20], [14, 20], [14, 20]],
};
const band = (width: number) => (width <= 339 ? 0 : width <= 374 ? 1 : width <= 389 ? 2 : width <= 413 ? 3 : 4);

const css = ts.sys.readFile(decodeURIComponent(new URL("./tokens.css", import.meta.url).pathname).replace(/^\/([a-z]:\/)/i, "$1"))!;
const start = css.indexOf("/* Five responsive type bands");
const block = css.slice(start);

type Rule = { min: number; max: number; vars: Record<string, string> };
const rules: Rule[] = [];
for (const match of block.matchAll(/(?:@media\s*([^{]+)\{\s*)?:root\s*\{([^}]*)\}/g)) {
  const query = match[1] ?? "";
  const min = Number(query.match(/min-width:\s*(\d+)px/)?.[1] ?? 0);
  const max = Number(query.match(/max-width:\s*(\d+)px/)?.[1] ?? Infinity);
  const vars = Object.fromEntries([...match[2].matchAll(/(--ui-type-[a-z-]+):\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  rules.push({ min, max, vars });
}

function resolve(width: number): Record<string, string> {
  const hits = rules.filter(rule => width >= rule.min && width <= rule.max);
  // The default block plus at most one band override may match any integer width.
  expect(hits.filter(rule => rule.min > 0 || rule.max < Infinity).length, `width ${width}`).toBeLessThanOrEqual(1);
  return Object.assign({}, ...hits.map(rule => rule.vars));
}

it.each([320, 339, 340, 360, 374, 375, 389, 390, 413, 414, 430, 768])("resolves every role to the table at %ipx", width => {
  const vars = resolve(width);
  for (const [role, rows] of Object.entries(TABLE)) {
    const [size, lineHeight] = rows[band(width)];
    expect(vars[`--ui-type-${role}`], `${role} @${width}`).toBe(`${size}px`);
    expect(vars[`--ui-type-${role}-lh`], `${role}-lh @${width}`).toBe(`${lineHeight}px`);
  }
});

it("keeps the 320 and 360 list tiers distinct from the 390 tier", () => {
  for (const width of [320, 360]) expect(resolve(width)["--ui-type-list-title"]).not.toBe(resolve(390)["--ui-type-list-title"]);
});

it("defines no responsive role outside the five-band block", () => {
  expect(css.slice(0, start)).not.toMatch(/--ui-type-[a-z-]+\s*:/);
});

// Visual spec 2.0 weights (DS-21): 400 / 500 / 600 only, at most 500 at 14px and below; the
// wallet balance keeps its approved 500 / 550 (DS-15).
it.each([320, 360, 375, 390, 430])("keeps role weights inside the 2.0 rules at %ipx", width => {
  const vars = resolve(width);
  for (const role of Object.keys(TABLE)) {
    const weight = Number(vars[`--ui-type-${role}-weight`]);
    expect(weight, `${role}-weight @${width}`).toBeGreaterThan(0);
    if (role === "wallet-amount") { expect(weight).toBe(width < 375 ? 500 : 550); continue; }
    expect([400, 500, 600], `${role}-weight @${width}`).toContain(weight);
    if (parseFloat(vars[`--ui-type-${role}`]) <= 14) expect(weight, `${role} at 14px or below @${width}`).toBeLessThanOrEqual(500);
  }
});
