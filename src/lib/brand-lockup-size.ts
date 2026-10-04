// 品牌标渲染尺寸的唯一算法(BrandLockup 组件用它,红测盯它)。
//
// 为什么单独拎出来:批准包给横版和纯图形各定了**最小渲染尺寸**(横版宽 ≥120px、
// 纯图形 ≥32px)。这不是洁癖 —— 这版标是 8 节点球体带柔光,实测渲染到 71/80px 宽时
// 节点糊成一个绿点、只剩字标可读,到 120px 才分得开。历史上正是因为「保持原有占位」
// 把它塞进 80px 的老槽,才有了那次返工。把下限焊成纯函数 + 红测,改反了会当场红。

export type BrandVariant = "lockup" | "mark";

/** 批准包原始像素:横版 compact 356×120 · 纯图形 180×180。 */
const RATIO: Record<BrandVariant, number> = { lockup: 712 / 246, mark: 1 };

/** 批准包写死的最小渲染宽度。 */
const MIN_WIDTH: Record<BrandVariant, number> = { lockup: 120, mark: 32 };

/**
 * 按期望高度算出实际渲染盒子;低于下限时按下限反算,**不允许缩到下限以下**。
 * 返回整数 px —— 半像素会让柔光边缘发虚。
 */
export function brandLockupBox(height: number, variant: BrandVariant): { width: number; height: number } {
  const ratio = RATIO[variant];
  const safeHeight = Math.max(height, MIN_WIDTH[variant] / ratio);
  return { width: Math.round(safeHeight * ratio), height: Math.round(safeHeight) };
}
