import { describe, expect, it } from "vitest";
import { recordShareEvent, shareIntentRecordsEvent } from "@/lib/share";
// 用 `?raw` 取源码而不是 `node:fs`:本仓的 type-check 面不含 node 类型
// (首版用 `node:fs` 直接让 type-check 齿轮红,报 TS2307)。`?raw` 是既有约定
// (staking.vue?raw 等),既拿到文本又不引入 node 依赖。
import shareSource from "@/lib/share.ts?raw";

/**
 * zentao #199:在团队页打开「立即分享」面板后点「复制链接」,页面先提示「链接已复制」,
 * 紧接着 `POST /api/share/event` 返回 422,又显示「分享已发出,但服务端暂时无法验证任务,未发放奖励」。
 *
 * 一次**纯本地操作**被说成了一次失败的分享。真因是 `activateChannel` 的 `copy` 分支
 * 也调了 `recordShareEvent` —— 而「复制」只是把文本放进剪贴板,用户并没有把内容发到任何渠道。
 *
 * 本门钉住两件事:意图到「是否算分享」的映射;以及 `copy` 分支不得再记录事件。
 */
describe("share intent records an event", () => {
  it("does not treat copying a link as a share", () => {
    expect(shareIntentRecordsEvent("copy")).toBe(false);
    // 生成海报同理:产物留在本地,没有发出去。
    expect(shareIntentRecordsEvent("poster")).toBe(false);
  });

  it("counts only intents that actually reach a channel", () => {
    // web/system:真的打开了目标渠道 / 走完了系统分享面板。
    expect(shareIntentRecordsEvent("web")).toBe(true);
    expect(shareIntentRecordsEvent("system")).toBe(true);
    expect(shareIntentRecordsEvent("scheme")).toBe(false);
  });
});

it("rejects clipboard and local poster event channels at the recording boundary", async () => {
  for (const channel of ["copy", "code", "link", "poster"]) {
    expect(await recordShareEvent(channel, "share_sheet")).toBe(false);
  }
});

describe("share.ts copy branch", () => {
  // 剥掉注释再判:说明里会**引用** recordShareEvent 这个标识符来解释为什么不该调用它,
  // 不剥注释就会把自己的解释当成违规(首版实测)。
  const source = shareSource
    .replace(/\/\*[\s\S]*?\*\//g, (m: string) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/[^\n]*/gm, (m: string) => " ".repeat(m.length));

  it("keeps recordShareEvent out of the copy branch", () => {
    const copyBranch = source.slice(source.indexOf('case "copy": {'), source.indexOf('case "system": {'));
    expect(copyBranch).not.toContain("recordShareEvent");
    const schemeBranch = source.slice(source.indexOf('case "scheme": {'), source.indexOf('case "copy": {'));
    expect(schemeBranch).not.toContain("recordShareEvent");
    const webFallback = source.slice(source.indexOf('const ok = await copyText(text);'), source.indexOf('case "scheme": {'));
    expect(webFallback).not.toContain("recordShareEvent");
  });
});
