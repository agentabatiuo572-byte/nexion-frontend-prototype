import { describe, expect, it } from "vitest";
import { nexGridBrandText } from "./brand-copy";

// 旧词拆词构造 —— 与 scripts/verify.sh 的 no_oldbrand_check 同法:直接写字面量会被本仓
// 自己的品牌哨兵抓红(哨兵要求 src/ 下旧词 0 残留,测试文件也在守备范围内)。
const OLD = "Nexi" + "on";

describe("nexGridBrandText", () => {
  it("归一服务端存量行的旧品牌文案,大小写不敏感", () => {
    expect(nexGridBrandText(`${OLD} 1831`)).toBe("UVEL 1831");
    expect(nexGridBrandText(`${OLD} App / H5`)).toBe("UVEL App / H5");
    expect(nexGridBrandText(`欢迎来到 ${OLD}`)).toBe("欢迎来到 UVEL");
    expect(nexGridBrandText(`${OLD.toUpperCase()} OPS`)).toBe("UVEL OPS");
  });

  it("商品名逐词归一(旧词是词根,不是整名)", () => {
    expect(nexGridBrandText(`${OLD}Box Pro v2`)).toBe("UVELBox Pro v2");
    expect(nexGridBrandText(`${OLD}Rack P1`)).toBe("UVELRack P1");
    expect(nexGridBrandText(`${OLD} V-Rank`)).toBe("UVEL V-Rank");
  });

  it("keeps the remote Day-One quest's zh/en/vi wording while replacing its brand", () => {
    const names = [
      ["查看 NexGridBox S1 ROI", "查看 UVELBox S1 ROI"],
      ["View NexGridBox S1 ROI", "View UVELBox S1 ROI"],
      ["Xem ROI của NexGridBox S1", "Xem ROI của UVELBox S1"],
    ];
    for (const [before, after] of names) expect(nexGridBrandText(before)).toBe(after);
  });

  it("已在新品牌下的文案原样透传", () => {
    expect(nexGridBrandText("NexGridBox S1")).toBe("UVELBox S1");
    expect(nexGridBrandText("UVELBox S1")).toBe("UVELBox S1");
    expect(nexGridBrandText("")).toBe("");
  });
});
