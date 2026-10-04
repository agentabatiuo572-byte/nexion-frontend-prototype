import { describe, expect, it } from "vitest";

const sources = import.meta.glob(["./genesis/*.vue", "./staking/*.vue"], {
  query: "?raw", import: "default", eager: true,
}) as Record<string, string>;
const read = (relative: string) => sources[relative] ?? "";

describe("dialog focus roots", () => {
  it.each([
    ["./genesis/eligibility-sheet.vue", "nx-elig-root"],
    ["./staking/stake-sheet.vue", "nx-staking-sheet-root"],
  ])("keeps the backdrop and interactive panel inside %s", (file, root) => {
    const source = read(file);
    expect(source).toContain(`class="${root}" role="dialog" aria-modal="true"`);
    expect(source).toContain(`useDialogA11y(computed(() => props.open), ".${root}"`);
  });

  it("keeps Genesis purchase and success in one focus lifecycle", () => {
    const source = read("./genesis/purchase-sheet.vue");
    expect(source).toContain('class="nx-genesis-purchase-root" role="dialog" aria-modal="true"');
    expect(source).toContain('class="nx-genesis-success fixed inset-0 grid place-items-center"');
    expect(source).toContain("const dialogOpen = computed(() => props.open || showSuccess.value)");
    expect(source).toContain("useDialogA11y(dialogOpen,");
    expect(source).toContain("showSuccess.value ? \".nx-genesis-success\" : \".nx-genesis-purchase-root\"");
  });
});
