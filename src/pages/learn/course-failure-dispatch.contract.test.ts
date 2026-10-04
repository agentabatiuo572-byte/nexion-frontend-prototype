import { describe, expect, it } from "vitest";
import { zh } from "@/i18n/messages/zh";
import { en } from "@/i18n/messages/en";
import { vi } from "@/i18n/messages/vi";
// @ts-expect-error Vitest executes this structural contract in Node; the App tsconfig intentionally omits Node globals.
import { readFileSync } from "node:fs";

/**
 * zentao #240:缺少课程 ID 时误报「受信任网络」错误。
 *
 * `performLoad()` 把两种情况写在同一条分支里 —— `if (!remoteApiEnabled || !requestedCourseId)`
 * 都落到 `courseOffline`(「课程需要在受信任网络中获取」)。深链没带 courseId 或参数丢失时,
 * 页面把用户引向「检查网络」这个错误方向,而真正该做的是从教程中心重新进入。
 *
 * 本门钉住:两种情况各有各的文案,且文案确实不同(不是换个 key 还共用同一句话)。
 */
const courseSource = readFileSync(new URL("./course.vue", import.meta.url), "utf8");

/** 三语字典的 learning 段:导出类型已完整,直接读取即可,无需断言。 */
const LOCALES = [
  { name: "zh", learning: zh.learning },
  { name: "en", learning: en.learning },
  { name: "vi", learning: vi.learning },
] as const;

describe("learning course failure dispatch", () => {
  it("keeps a missing course id separate from an offline/untrusted network", () => {
    // 两个条件必须各自成分支:合并写法正是本单的成因。
    expect(courseSource).not.toMatch(/!remoteApiEnabled\s*\|\|\s*!requestedCourseId/);
    expect(courseSource).toMatch(/if \(!remoteApiEnabled\) \{/);
    expect(courseSource).toMatch(/if \(!requestedCourseId\.trim\(\)\) \{/);
    expect(courseSource).toMatch(/error\.value = "courseIdMissing"/);
    expect(courseSource.indexOf("if (!requestedCourseId.trim())")).toBeLessThan(courseSource.indexOf("if (!remoteApiEnabled)"));
    expect(courseSource).toMatch(/cause instanceof ApiError && cause\.kind === "network" \? "courseOffline"/);
    expect(courseSource).toMatch(/error === 'courseIdMissing'.*backToCourses/);
    expect(courseSource).toMatch(/navReplace\("\/pages\/learn\/courses"\)/);
  });

  it("gives the missing-id case its own wording in every locale", () => {
    for (const { name, learning } of LOCALES) {
      const missingId = learning.courseIdMissing;
      expect(missingId, name).toBeTruthy();
      expect(missingId, `${name} 不能与 courseOffline 同文`).not.toBe(learning.courseOffline);
      // 文案必须足够说明「重新进入课程」这个可行动作,而不是让人去查网络。
      expect(missingId.length, name).toBeGreaterThan(10);
    }
  });
});
