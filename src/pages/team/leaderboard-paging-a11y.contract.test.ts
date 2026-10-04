import segments from "@/components/glass-segments.vue?raw";
import { describe, expect, it } from "vitest";

const source = (import.meta.glob("./leaderboard.vue", {
  query: "?raw", import: "default", eager: true,
})["./leaderboard.vue"] ?? "") as string;

describe("leaderboard paging and keyboard contract", () => {
  it("loads concrete server pages instead of truncating the first 100 rows", () => {
    expect(source).toContain("teamInsightsApi.leaderboard(requestedPeriod, page, PAGE_SIZE,");
    expect(source).toContain("append ? remoteSnapshot.value?.snapshotAt : null");
    expect(source).toContain("append ? remoteSnapshot.value?.snapshotVersion : null");
    expect(source).toContain("snapshot.snapshotVersion !== previous.snapshotVersion");
    expect(source).toContain('apiError.message === "TEAM_LEADERBOARD_SNAPSHOT_STALE"');
    expect(source).toContain("void loadRemote(1, false)");
    expect(source).toContain("rows.value.length < (remoteSnapshot.value?.totalRows ?? 0)");
    expect(source).toContain("rows: [...previous.rows, ...snapshot.rows]");
  });

  it("keeps tabs and click targets keyboard operable", () => {
    expect(source).toMatch(/<GlassSegments[^>]*:model-value="period"[^>]*:options="periodOptions"/);
    expect(segments).toMatch(/:tabindex="option.disabled \? -1 : [^\"]*option.value === modelValue \? 0 : -1"/);
    expect(segments).toContain('option.value === modelValue');
    expect(segments).toContain('@keydown="onKeydown($event, option)"');
    expect(segments).toContain('choose(target, "arrow")');
    expect(segments).toContain('?.focus()');
    expect(source).toContain('@keydown.space.prevent="loadMore"');
    expect(source).toContain('@keydown.space.prevent="loadRemote()"');
  });

  /**
   * 简报 #215:报告称四个周期筛选「无 button/tab/radio 角色、无 tabindex、
   * 当前选中项也无 aria-selected/aria-checked/aria-pressed」。
   *
   * 实现侧其实早已具备完整语义(role=tablist + tab + roving tabindex + aria-selected),
   * 但本用例此前**只断言了角色与方向键,没有断言「唯一选中项」那一半** —— 也就是
   * 报告真正指出的维度。补齐它:互斥筛选必须暴露唯一当前选中项,且 roving tabindex
   * 只落在选中项上,否则键盘用户会停在一个不可达的 tab 上。
   */
  it("exposes exactly one selected period and roving tabindex on it", () => {
    expect(source).toContain(':label="t.leaderboard.pageTitle"');
    expect(segments).toContain(':aria-selected=');
    expect(segments).toMatch(/:tabindex="option.disabled \? -1 : [^\"]*option.value === modelValue \? 0 : -1"/);
    expect(segments).toContain('option.value === modelValue');
    expect(segments).toContain('@keydown="onKeydown($event, option)"');
    expect(segments).toContain('choose(target, "arrow")');
    expect(segments).toContain('?.focus()');
    // 四个周期都渲染自同一份 PERIODS,不存在漏标语义的那一项。
    expect(source).toMatch(/const PERIODS: LeaderPeriod\[\] = \["today", "week", "month", "all"\]/);
    // 点击与键盘都必须走同一个选中函数(否则鼠标/键盘行为会分叉)。
    expect(source).toContain('@select="selectPeriod"');
    expect(source).toContain('PERIODS.map(value =>');
  });
});
