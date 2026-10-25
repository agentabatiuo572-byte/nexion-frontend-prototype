import { describe, expect, it } from "vitest";
import { brandLockupBox } from "./brand-lockup-size";

describe("brandLockupBox", () => {
  it("下限之上,横版按 712:246 的当前素材比例出盒子", () => {
    expect(brandLockupBox(60, "lockup")).toEqual({ width: 174, height: 60 });
    expect(brandLockupBox(100, "lockup")).toEqual({ width: 289, height: 100 });
  });

  it("独立符号保留官方490:361的非正方形比例", () => {
    expect(brandLockupBox(60, "mark")).toEqual({ width: 81, height: 60 });
  });

  it("紧凑组合标保留144px可辨字标下限", () => {
    expect(brandLockupBox(40, "lockup")).toEqual({ width: 144, height: 50 });
    expect(brandLockupBox(27, "lockup")).toEqual({ width: 144, height: 50 });
    expect(brandLockupBox(1, "lockup").width).toBe(144);
  });

  it("独立符号宽度至少24px且不被拉成方形", () => {
    expect(brandLockupBox(22, "mark")).toEqual({ width: 30, height: 22 });
    expect(brandLockupBox(0, "mark")).toEqual({ width: 24, height: 18 });
  });

  it("达标尺寸原样透传,不被下限顶大", () => {
    expect(brandLockupBox(60, "lockup").height).toBe(60);
    expect(brandLockupBox(60, "mark").height).toBe(60);
  });
});
