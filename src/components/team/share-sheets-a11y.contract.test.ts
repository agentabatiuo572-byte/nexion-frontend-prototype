import { describe, expect, it } from "vitest";

const sources = import.meta.glob("./*.vue", {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const read = (relative: string) => sources[relative] ?? "";

describe("share sheet accessibility", () => {
  it.each([
    ["./share-channel-sheet.vue", "ss-root"],
    ["./share-poster-sheet.vue", "ps-root"],
  ])("exposes dialog semantics and traps focus in %s", (file, root) => {
    const source = read(file);
    expect(source).toContain(`class="${root}" role="dialog" aria-modal="true"`);
    expect(source).toContain(`useDialogA11y(computed(() => props.open), ".${root}"`);
  });
});
