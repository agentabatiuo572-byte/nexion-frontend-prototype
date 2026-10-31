import { baseParse, type ElementNode, type RootNode, type TemplateChildNode } from "@vue/compiler-dom";
import { parse } from "@vue/compiler-sfc";
import ts from "typescript";
import { normalizeClass } from "vue";
import { expect, it } from "vitest";

type Style = Record<string, string | number>;
type Bindings = Record<string, unknown>;
const read = (path: string) => {
  const filename = decodeURIComponent(new URL(`../${path}`, import.meta.url).pathname).replace(/^\/([a-z]:\/)/i, "$1");
  const source = ts.sys.readFile(filename);
  if (source === undefined) throw new Error(`Contrast consumer not readable: ${filename}`);
  return source;
};
const tokenCSS = read("styles/tokens.css");
const glassCSS = read("styles/glass-surfaces.css");
const declarations = (source: string): Style => Object.fromEntries(source.split(";").filter(part => part.includes(":"))
  .map(part => { const colon = part.indexOf(":"); return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()]; }));
const flatGlass = declarations(glassCSS.match(/\.nx-glass-card:not\(\.nx-glass-hero\),\s*\.nx-home-glass-panel\s*\{([^}]+)\}/)![1]);

function sfc(path: string, names: string[] = [], bindings: Bindings = {}) {
  const source = parse(read(path), { filename: path }).descriptor;
  const ast = ts.createSourceFile(path, source.scriptSetup!.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const selected = ast.statements.filter(statement => ts.isFunctionDeclaration(statement)
    ? names.includes(statement.name?.text ?? "")
    : ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => names.includes(declaration.name.getText(ast))));
  const code = ts.transpileModule(selected.map(statement => statement.getText(ast)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const locals = new Function(...Object.keys(bindings), `${code}\nreturn {${names.join(",")}};`)(...Object.values(bindings)) as Bindings;
  return { ast: baseParse(source.template!.content), bindings: { ...bindings, ...locals } };
}
type Source = ReturnType<typeof sfc>;
const evaluate = (expression: string, bindings: Bindings) => new Function(...Object.keys(bindings), `return (${expression});`)(...Object.values(bindings));
function attribute(node: ElementNode, name: string, bound = false): string | undefined {
  const prop = node.props.find(prop => bound
    ? prop.type === 7 && prop.name === "bind" && prop.arg?.type === 4 && prop.arg.content === name
    : prop.type === 6 && prop.name === name);
  if (prop?.type === 7 && prop.exp && prop.exp.type !== 4) throw new Error(`Unsupported contrast binding: ${name}`);
  return prop?.type === 6 ? prop.value?.content : prop?.type === 7 && prop.exp?.type === 4 ? prop.exp.content : undefined;
}
function paths(root: RootNode, match: (node: ElementNode) => boolean) {
  const found: ElementNode[][] = [];
  function visit(node: RootNode | TemplateChildNode, parents: ElementNode[]) {
    const chain = node.type === 1 ? [...parents, node] : parents;
    if (node.type === 1 && match(node)) found.push(chain);
    if (node.type === 0 || node.type === 1) for (const child of node.children) visit(child, chain);
  }
  visit(root, []);
  return found;
}
function onePath(source: Source, match: (node: ElementNode) => boolean) {
  const found = paths(source.ast, match);
  expect(found).toHaveLength(1);
  return found[0].map(node => ({ node, bindings: source.bindings }));
}
const chassis = sfc("components/app-chassis.vue", [], { pullActive: false, isTabRoute: false, contentTop: 0, pendingBarInset: 0, contentBottom: 0 });
const chassisPath = onePath(chassis, node => node.tag === "slot" && !attribute(node, "name"));
const me = sfc("pages/me/me.vue");
const security = sfc("pages/me/security.vue", ["cardStyle", "groupGap", "revokeAllRowStyle", "revokeAllLabelStyle"]);
const weekly = sfc("components/home/weekly-quest-list.vue", ["cardStyle", "completedRowStyle", "categoryLabelStyle", "claimErrorStyle"], { i: 0, tier2Quests: [{}] });
const missions = sfc("pages/missions/missions.vue", ["sectionStyle"]);
const market = sfc("components/home/market-board-card.vue", ["deltaColor"], {
  displayRow: () => ({ deltaTone: "negative" }), row: {}, i: 0, homeMarketRows: [{}], marketGridColumns: "",
});
const home = sfc("pages/index/index.vue");
const withdraw = sfc("pages/me/wallet-withdraw.vue", ["holdBannerStyle"]);
const boundStyle = (name: string) => (node: ElementNode) => node.tag === "text" && attribute(node, "style", true) === name;
const cases = [
  // Order status chips now use the shared NxTag danger tone instead of a page-owned style.
  { name: "me order retry", chain: onePath(me, node => node.tag === "text" && node.loc.source.includes("{{ t.ui.retry }}")) },
  ...["revokeAll", "cancelDeletionRequest"].map(action => ({
    name: `security ${action}`, chain: onePath(security, node => boundStyle("revokeAllLabelStyle")(node) && node.loc.source.includes(`t.security.${action} }`)),
  })),
  { name: "weekly claim failure", chain: [...onePath(missions, node => node.tag === "WeeklyQuestList"), ...onePath(weekly, boundStyle("claimErrorStyle"))] },
  { name: "market negative delta", chain: [...onePath(home, node => node.tag === "MarketBoardCard"), ...onePath(market, node => node.tag === "text" && Boolean(attribute(node, "style", true)?.includes("deltaColor(row)")))] },
  { name: "withdraw abandon", chain: onePath(withdraw, node => node.tag === "text" && node.loc.source.includes("abandoningAttempt ?")) },
];

function contrast(chain: typeof chassisPath, theme: "light" | "dark", pressed: boolean) {
  const light = tokenCSS.match(/:root\s*\{([^}]+)\}/)![1];
  const dark = tokenCSS.match(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]+)\}/)![1];
  const tokens: Style = { ...declarations(light.replace(/\/\*[\s\S]*?\*\//g, "")), ...(theme === "dark" ? declarations(dark.replace(/\/\*[\s\S]*?\*\//g, "")) : {}) };
  let vars: Style = tokens;
  function color(value: string): number[] {
    const token = value.match(/^var\((--[\w-]+)\)$/);
    if (token) { expect(vars[token[1]], token[1]).toBeDefined(); return color(String(vars[token[1]])); }
    if (value === "transparent") return [0, 0, 0, 0];
    if (/^#[\da-f]{6}$/i.test(value)) return [...[1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255), 1];
    const rgba = value.match(/^rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)$/);
    if (rgba) return rgba.slice(1).map((channel, index) => Number(channel) / (index < 3 ? 255 : 1));
    const mix = value.match(/^color-mix\(in srgb, (var\(--[\w-]+\)|#[\da-f]{6}) ([\d.]+)%, transparent\)$/i);
    expect(mix, `Unsupported consumer color: ${value}`).not.toBeNull();
    const result = color(mix![1]); result[3] *= Number(mix![2]) / 100; return result;
  }
  const composite = (foreground: number[], background: number[], alpha = foreground[3]) => foreground.slice(0, 3)
    .map((channel, index) => channel * alpha + background[index] * (1 - alpha));
  let background: number[] | undefined, foreground: number[] | undefined;
  const layers: { parent: number[]; opacity: number }[] = [];
  for (const { node, bindings } of chain) {
    const classes = normalizeClass([attribute(node, "class") ?? "", attribute(node, "class", true) ? evaluate(attribute(node, "class", true)!, bindings) : ""]);
    const inline = declarations(attribute(node, "style") ?? "");
    const bound = attribute(node, "style", true);
    const value = bound ? evaluate(bound, bindings) : {};
    const style: Style = { ...inline, ...Object.assign({}, ...(Array.isArray(value) ? value : [value])) };
    if (classes.split(/\s+/).includes("nx-glass-card")) vars = { ...vars, ...flatGlass };
    vars = { ...vars, ...Object.fromEntries(Object.entries(style).filter(([name]) => name.startsWith("--"))) };
    const fill = style.background ?? style["background-color"] ?? style.backgroundColor;
    const parent = background;
    if (fill !== undefined) {
      const rgba = color(String(fill));
      if (!background) expect(rgba[3], "Root consumer background must be opaque").toBe(1);
      background = background ? composite(rgba, background) : rgba.slice(0, 3);
    }
    expect(background, "Consumer must reach its actual chassis background").toBeDefined();
    const activeOpacity = pressed ? classes.match(/(?:^|\s)active:opacity-(\d+)(?:\s|$)/)?.[1] : undefined;
    const staticOpacity = classes.match(/(?:^|\s)opacity-(\d+)(?:\s|$)/)?.[1];
    const classOpacity = activeOpacity ?? staticOpacity;
    layers.push({ parent: parent ?? background!, opacity: Number(style.opacity ?? (classOpacity ? Number(classOpacity) / 100 : 1)) });
    if (style.color !== undefined) foreground = color(String(style.color));
  }
  expect(foreground, "Consumer foreground must come from the actual SFC").toBeDefined();
  let text = composite(foreground!, background!), floor = background!;
  // Opacity flattens the whole descendant group back onto this ancestor's parent.
  for (const layer of layers.reverse()) {
    text = composite(text, layer.parent, layer.opacity);
    floor = composite(floor, layer.parent, layer.opacity);
  }
  const luminance = (rgb: number[]) => rgb.map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
    .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  const values = [luminance(text), luminance(floor)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

const matrix = cases.flatMap(consumer => (["light", "dark"] as const).flatMap(theme => [false, true]
  .map(pressed => ({ ...consumer, theme, pressed, state: pressed ? "pressed" : "normal" }))));
it.each(matrix)("keeps $name readable in $theme/$state on its real ancestor backgrounds", ({ chain, theme, pressed }) => {
  expect(contrast([...chassisPath, ...chain], theme, pressed)).toBeGreaterThanOrEqual(4.5);
});

it.each([
  { name: "array", value: ["inline-flex", "active:opacity-40"] },
  { name: "object", value: { "inline-flex": true, "active:opacity-40": true } },
])("detects an opacity regression when the actual retry ancestor uses a $name class binding", ({ value }) => {
  const binding = (baseParse('<view :class="classNames" />').children[0] as ElementNode).props;
  const chain = cases.find(consumer => consumer.name === "me order retry")!.chain.map(entry => attribute(entry.node, "data-me-action") === "retry-orders"
    ? { node: { ...entry.node, props: [...entry.node.props.filter(prop => prop.type !== 6 || prop.name !== "class"), ...binding] }, bindings: { ...entry.bindings, classNames: value } }
    : entry);
  expect(contrast([...chassisPath, ...chain], "light", true)).toBeLessThan(4.5);
});
