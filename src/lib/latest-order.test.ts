import { expect, test } from "vitest";
import { latestOrder } from "./latest-order";

test("latest order is invariant under list order and older pagination", () => {
  const old = { placedAt: 1, id: "old" };
  const newest = { placedAt: 3, id: "newest" };
  expect(latestOrder([newest, old])).toBe(newest);
  expect(latestOrder([old, newest, { placedAt: 2 }])).toBe(newest);
  expect(latestOrder([])).toBeNull();
});
