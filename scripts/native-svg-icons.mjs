import { parse } from "@vue/compiler-sfc";

// App-vue does not reliably render template SVG elements. Keep charts and
// illustrations untouched; convert icon-sized SVGs to a component that writes
// SVG markup through the App view layer's supported v-html path.
export function nativeSvgIcons() {
  return {
    name: "nexgrid-native-svg-icons",
    enforce: "pre",
    transform(source, id) {
      if (process.env.UNI_PLATFORM !== "app" || !id.endsWith(".vue") || !source.includes("<svg")) return null;
      const { descriptor } = parse(source, { filename: id });
      const root = descriptor.template?.ast;
      if (!root) return null;

      const edits = [];
      const visit = (node) => {
        if (node.type === 1 && node.tag === "svg" && !node.isSelfClosing) {
          const size = (name) => Number(node.props.find((prop) => prop.type === 6 && prop.name === name)?.value?.content);
          if (size("width") > 0 && size("width") <= 80 && size("height") > 0 && size("height") <= 80) {
            edits.push([node.loc.start.offset + 1, 3, "NxNativeSvg"]);
            edits.push([node.loc.end.offset - 4, 3, "NxNativeSvg"]);
          }
        }
        for (const child of node.children ?? []) visit(child);
      };
      visit(root);
      if (!edits.length) return null;
      let code = source;
      for (const [offset, length, replacement] of edits.sort((a, b) => b[0] - a[0])) {
        code = code.slice(0, offset) + replacement + code.slice(offset + length);
      }
      return { code, map: null };
    },
  };
}
