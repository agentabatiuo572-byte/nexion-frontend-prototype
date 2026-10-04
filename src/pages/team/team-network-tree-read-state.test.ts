import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { compileTemplate, parse } from "@vue/compiler-sfc";
import * as Vue from "vue";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";
import networkPage from "./network.vue?raw";
import treePage from "./tree.vue?raw";
import { en } from "@/i18n/messages/en";
import { zh } from "@/i18n/messages/zh";
import { vi as viMessages } from "@/i18n/messages/vi";

function templateOf(source: string): string {
  return source.slice(source.indexOf("<template>"), source.indexOf("<script"));
}

const treeTemplate = parse(treePage, { filename: "tree.vue" }).descriptor.template?.content;
if (!treeTemplate) throw new Error("tree template is required for its read-state test");
const treeRender = new Function("Vue", `${compileTemplate({ source: treeTemplate, filename: "tree.vue", id: "team-tree-read-state", compilerOptions: { mode: "function" } }).code}; return render;`)(Vue);

async function renderTree(remoteStatus: "idle" | "loading" | "ready" | "error", remote = true): Promise<string> {
  return renderToString(createSSRApp({
    components: {
      AppChassis: { setup: (_props: unknown, { slots }: { slots: { default?: () => Vue.VNode[] } }) => () => h("main", slots.default?.()) },
      SubPageHeader: { render: () => h("header") },
      TeamRosterSection: { props: ["emptyLabel"], render() { return h("section", this.$props.emptyLabel); } },
    },
    setup: () => ({
      remoteApiEnabled: remote,
      network: { remoteStatus, refreshCanonicalNetwork: vi.fn(), ensureCanonicalNetwork: vi.fn() },
      t: { network: en.network, tree: en.tree },
      members: [], direct: [], extended: [], totalVol: 0, directSubtitle: "", extendedSubtitle: "",
      expanded: { direct: true, extended: true }, errorStateStyle: {}, retryStyle: {}, readStateStyle: {},
      metricCardStyle: {}, metricLabelStyle: {}, metricSuffixStyle: {}, metricValueStyle: () => ({}),
    }),
    render: treeRender,
  }));
}

describe("team network and tree remote read states", () => {
  it("refreshes a cached Tree on return using the same coalesced read as mount", () => {
    const mounted: Array<() => void> = [], shown: Array<() => void> = [];
    const lifecycle = treePage.slice(treePage.indexOf("onMounted("), treePage.indexOf("const members ="));
    const compiled = ts.transpileModule(lifecycle, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    const network = { ensureCanonicalNetwork: vi.fn() };
    new Function("remoteApiEnabled", "network", "onMounted", "onShow", compiled)(true, network,
      (callback: () => void) => mounted.push(callback), (callback: () => void) => shown.push(callback));
    expect(mounted).toHaveLength(1);
    expect(shown).toHaveLength(1);
    mounted[0](); shown[0]();
    expect(network.ensureCanonicalNetwork).toHaveBeenCalledTimes(2);
    shown[0]();
    expect(network.ensureCanonicalNetwork).toHaveBeenCalledTimes(3);
  });

  it("renders the actual Tree template as loading/error rather than remote empty rosters, while retaining ready and mock empty states", async () => {
    const [loading, failed, ready, mock] = await Promise.all([
      renderTree("loading"), renderTree("error"), renderTree("ready"), renderTree("ready", false),
    ]);

    expect(loading).toContain(en.network.projectionLoadingTitle);
    expect(loading).not.toContain(en.tree.emptyDirect);
    expect(loading).not.toContain(en.tree.emptyExtended);
    expect(failed).toContain(en.network.projectionErrorTitle);
    expect(failed).not.toContain(en.tree.emptyDirect);
    expect(failed).not.toContain(en.tree.emptyExtended);
    expect(ready).toContain(en.tree.emptyDirect);
    expect(ready).toContain(en.tree.emptyExtended);
    expect(mock).toContain(en.tree.emptyDirect);
    expect(mock).toContain(en.tree.emptyExtended);
    expect([en, zh, viMessages].map((messages) => messages.network.projectionLoadingTitle)).toEqual([
      "Loading team network…",
      "正在读取团队网络…",
      "Đang tải mạng lưới đội nhóm…",
    ]);
  });

  it("uses the coalesced read for mount and show, then permits a new settled read while retaining explicit refresh retry", async () => {
    const start = networkPage.indexOf("onMounted(() => {");
    const end = networkPage.indexOf("onUnmounted(() => {");
    const lifecycle = networkPage.slice(start, end);
    const compiled = ts.transpileModule(
      `let pulseTimer = null; let pulseCursor = 0; const pulseId = { value: null }; const members = { value: [] }; ${lifecycle}; return {};`,
      { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
    ).outputText;
    const mounted: Array<() => void> = [];
    const shown: Array<() => void> = [];
    let resolveFirst!: () => void;
    const underlyingRead = vi.fn()
      .mockReturnValueOnce(new Promise<void>((resolve) => { resolveFirst = resolve; }))
      .mockResolvedValueOnce(undefined);
    let flight: Promise<void> | null = null;
    const network = {
      ensureCanonicalNetwork: vi.fn(() => {
        if (!flight) flight = underlyingRead().finally(() => { flight = null; });
        return flight;
      }),
      refreshCanonicalNetwork: vi.fn(),
    };

    new Function("remoteApiEnabled", "network", "onMounted", "onShow", "setInterval", compiled)(
      true,
      network,
      (callback: () => void) => mounted.push(callback),
      (callback: () => void) => shown.push(callback),
      () => 1,
    );
    mounted.forEach((callback) => callback());
    shown.forEach((callback) => callback());
    expect(underlyingRead).toHaveBeenCalledTimes(1);

    resolveFirst();
    await network.ensureCanonicalNetwork.mock.results[0]?.value;
    shown.forEach((callback) => callback());
    expect(underlyingRead).toHaveBeenCalledTimes(2);
    expect(templateOf(networkPage)).toContain('@click="network.refreshCanonicalNetwork()"');
  });
});
