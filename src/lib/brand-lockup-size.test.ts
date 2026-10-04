import { describe, expect, it } from "vitest";
import { brandLockupBox } from "./brand-lockup-size";

describe("brandLockupBox", () => {
  it("下限之上,横版按 712:246 的当前素材比例出盒子", () => {
    expect(brandLockupBox(60, "lockup")).toEqual({ width: 174, height: 60 });
    expect(brandLockupBox(100, "lockup")).toEqual({ width: 289, height: 100 });
  });

  it("纯图形是正方形", () => {
    expect(brandLockupBox(60, "mark")).toEqual({ width: 60, height: 60 });
  });

  // 🔴 下面几条就是下限门本身。它们变红 = 有人把标又缩回「糊成一个绿点」的尺寸。
  it("横版换算宽度不足 120px 时被抬到下限,而不是照传入值缩小", () => {
    // 40 × (712/246) = 115.8,不足 120;盒子要按当前素材比例抬高。
    expect(brandLockupBox(40, "lockup")).toEqual({ width: 120, height: 41 });
    expect(brandLockupBox(27, "lockup")).toEqual({ width: 120, height: 41 });
    expect(brandLockupBox(1, "lockup").width).toBe(120);
  });

  it("纯图形不足 32px 时被抬到 32", () => {
    expect(brandLockupBox(22, "mark")).toEqual({ width: 32, height: 32 });
    expect(brandLockupBox(0, "mark")).toEqual({ width: 32, height: 32 });
  });

  it("达标尺寸原样透传,不被下限顶大", () => {
    expect(brandLockupBox(60, "lockup").height).toBe(60);
    expect(brandLockupBox(60, "mark").height).toBe(60);
  });
});
