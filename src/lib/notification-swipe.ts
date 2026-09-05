export type SwipePoint = { x: number; y: number; at: number };

export function isLeftConversionSwipe(start: SwipePoint, end: SwipePoint): boolean {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const elapsed = end.at - start.at;
  return deltaX <= -64
    && Math.abs(deltaY) <= Math.abs(deltaX) * 0.6
    && elapsed >= 0
    && elapsed <= 1000;
}
