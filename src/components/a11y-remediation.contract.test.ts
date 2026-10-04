import segments from "@/components/glass-segments.vue?raw";
import { describe, expect, it } from "vitest";

const sources = import.meta.glob([
  "./me/device-deactivate-sheet.vue",
  "./me/theme-picker-sheet.vue",
  "./me/nickname-sheet.vue",
  "./me/receipt-modal.vue",
  "./slot-action-sheet.vue",
  "./tradein-sheets.vue",
  "./me/theme-row.vue",
  "../pages/me/wallet-withdraw.vue",
  "../pages/me/language.vue",
  "../pages/me/security.vue",
  "../pages/me/wallet.vue",
  "../pages/team/team.vue",
  "../pages/compute-share/download.vue",
  "../pages/learn/course.vue",
  "../pages/me/proof.vue",
  "./earn/capacity-explainer-sheet.vue",
  "./me/fx-rate-line.vue",
  "./me/tradein-ladder-sheet.vue",
  "./home/conversion-banner.vue",
  "../pages/developer/developer.vue",
], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const read = (relative: string) => sources[relative] ?? "";

describe("accessibility remediation contracts", () => {
  it.each([
    ["./me/device-deactivate-sheet.vue", "nx-device-deactivate-root", "props.device !== null"],
    ["./me/theme-picker-sheet.vue", "nx-theme-picker-root", "props.open"],
    ["./me/nickname-sheet.vue", "nx-nickname-sheet-root", "props.open"],
    ["./me/receipt-modal.vue", "nx-receipt-modal-root", "props.receipt !== null"],
  ])("makes %s a named, focus-trapped dialog", (file, root, openExpression) => {
    const source = read(file);
    expect(source).toContain(`class=\"${root}\" role=\"dialog\" aria-modal=\"true\"`);
    expect(source).toContain(`useDialogA11y(computed(() => ${openExpression}), \".${root}\"`);
  });

  it("keeps sheet actions keyboard-operable and blocks insufficient replacement", () => {
    expect(read("./slot-action-sheet.vue")).toContain('class="sas-close" role="button" tabindex="0"');
    const tradein = read("./tradein-sheets.vue");
    expect(tradein).toContain(':aria-disabled="replaceView.insufficient || confirming"');
    expect(tradein).toContain(':aria-busy="confirming"');
    expect(tradein).toContain('if (replaceView.value?.insufficient) return;');
    expect(tradein).toContain('class="tis-close" role="button" tabindex="0"');
  });

  it("preserves a single keyboard focus stop for theme and withdrawal radio groups", () => {
    const themeRow = read("./me/theme-row.vue");
    expect(themeRow).toContain('data-theme-mode="light"');
    expect(themeRow).toContain('nextTick(() =>');
    const withdraw = read("../pages/me/wallet-withdraw.vue");
    expect(withdraw).toContain('nx-withdraw-network-radio');
    expect(withdraw).toContain('@keydown.left.prevent="moveNetwork(-1)"');
    expect(withdraw).toContain('function moveNetwork(delta: number)');
  });

  it("keeps language and destructive security controls keyboard-operable", () => {
    const language = read("../pages/me/language.vue");
    // 语言是互斥单选:aria-pressed 会被读成多选 toggle(zentao #94),改钉 radiogroup/radio。
    expect(language).toContain('role="radiogroup" :aria-label="t.language.pageTitle"');
    expect(language).toContain('role="radio"');
    expect(language).toContain(':aria-checked="l.code === code ? \'true\' : \'false\'"');
    // 注释里提到旧写法不算数:钉的是**属性**不再出现在模板上。
    expect(language).not.toMatch(/:aria-pressed=/);
    expect(language).toContain('@keydown.space.prevent="pick(l.code)"');
    expect(language).toContain('@keydown.enter.prevent="retryCurrentProfileLocale"');
    expect(language).toContain('@keydown.space.prevent="goAccount"');

    const security = read("../pages/me/security.vue");
    expect(security).toContain('@keydown.space.prevent="editingPwd = !editingPwd"');
    expect(security).toContain('@keydown.enter.prevent="submitPasswordChange"');
    expect(security).toContain('@keydown.space.prevent="handleRevoke(s)"');
    expect(security).toContain('@keydown.enter.prevent="handleRevokeAll"');
    expect(security).toContain('@keydown.space.prevent="handleDeleteAccount"');
    expect(security).toContain('@keydown.enter.prevent="handleCancelAccountDeletion"');
  });

  it("uses the shared semantic activation contract on wallet, team, download, learning and developer actions", () => {
    const wallet = read("../pages/me/wallet.vue");
    expect(wallet).toContain('role="button" tabindex="0" :aria-label="t.wallet.nexBalance"');
    expect(wallet).toContain('role="button" tabindex="0" :aria-label="t.wallet.topUp"');

    const team = read("../pages/team/team.vue");
    expect(team).toMatch(/<view[^>]*class="[^"]*nx-team-rank-link[^"]*"[^>]*role="link" tabindex="0"[^>]*@click="go\('\/pages\/team\/rank'\)"/);
    expect(team).toMatch(/<view[^>]*class="[^"]*nx-team-leaderboard-link[^"]*"[^>]*role="link" tabindex="0"/);

    const download = read("../pages/compute-share/download.vue");
    expect(download).toContain('role="button" tabindex="0" :aria-label="t.computeShare.downloadCta"');
    expect(download).toContain('role="button"');
    // 显卡型号是互斥单选:同上,改钉 radiogroup/radio。
    expect(download).toContain('role="radiogroup" :aria-label="t.computeShare.modelLabel"');
    expect(download).toContain(':aria-checked="selectedModel === model ? \'true\' : \'false\'"');

    const course = read("../pages/learn/course.vue");
    expect(course).toContain('role="button" tabindex="0" :aria-label="t.learning.centerTitle" @click="backToCourses" @keydown.enter.prevent="onKeyboardActivate($event, backToCourses)" @keydown.space.prevent="onKeyboardActivate($event, backToCourses)"');
    expect(course).toContain('role="button" tabindex="0" :aria-label="t.ui.retry" @click="load" @keydown.enter.prevent="onKeyboardActivate($event, load)" @keydown.space.prevent="onKeyboardActivate($event, load)"');
    // Each question accepts exactly one answer, so the options are radios inside a
    // named radiogroup — aria-pressed would read as a multi-select toggle.
    expect(course).toContain('role="radiogroup" :aria-label="question.question"');
    expect(course).toContain(':aria-checked="answers[index] === optionIndex ? \'true\' : \'false\'"');

    const developer = read("../pages/developer/developer.vue");
    expect(developer).toMatch(/<GlassSegments[^>]*:label="t.developer.headline"[^>]*v-model="tab"[^>]*:options="tabOptions"/);
    expect(segments).toContain("'tablist'");
    expect(segments).toContain(':aria-selected=');
    expect(segments).toMatch(/:tabindex="option.disabled \? -1 : [^\"]*option.value === modelValue \? 0 : -1"/);
    expect(segments).toContain('option.value === modelValue');
    expect(segments).toContain('@keydown="onKeydown($event, option)"');
    expect(segments).toContain('choose(target, "arrow")');
    expect(segments).toContain('?.focus()');
    expect(developer).toContain('role="button" tabindex="0" :aria-label="t.developer.formSubmit"');

    const proof = read("../pages/me/proof.vue");
    expect(proof).toContain('@keydown.enter.stop.prevent="refreshRemoteProof"');
    expect(proof).toContain('@keydown.space.stop.prevent="copyLink"');
    expect(proof).toContain('@keydown.enter.stop.prevent="nativeShare"');
    expect(proof).toContain('@keydown.space.stop.prevent="d.onClick"');
  });

  it.each([
    ["./earn/capacity-explainer-sheet.vue", "nx-capacity-explainer-root", "visible.value"],
    ["./me/fx-rate-line.vue", "nx-fx-sheet-root", "sheetOpen.value"],
    ["./me/tradein-ladder-sheet.vue", "nx-tradein-ladder-root", "props.device !== null"],
  ])("makes %s a labelled, escaped and focus-trapped dialog", (file, root, openExpression) => {
    const source = read(file);
    expect(source).toMatch(new RegExp(`class="${root}[^\"]*"[^>]*role="dialog" aria-modal="true"`));
    expect(source).toContain(`useDialogA11y(computed(() => ${openExpression}), ".${root}"`);
  });

  it("names weekly recovery by the underlying state instead of presenting every case as a generic retry", () => {
    const banner = read("./home/conversion-banner.vue");
    expect(banner).toContain('weeklyRetryLabel');
    expect(banner).toContain('weeklyRetryAriaLabel');
    expect(banner).toContain('t.value.weeklyQuest.retryLogin');
    expect(banner).toContain('t.value.weeklyQuest.retryNetwork');
    expect(banner).toContain('t.value.weeklyQuest.noTaskAction');
  });
});
