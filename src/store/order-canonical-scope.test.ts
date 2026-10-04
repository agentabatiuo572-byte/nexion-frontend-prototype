import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  list: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@/api/runtime", () => ({ remoteApiEnabled: true, orderApi: { list: state.list } }));
vi.mock("@/store/content-copy", () => ({ useContentCopy: () => ({ reportOrderConversions: state.report }) }));

const { remoteAccountScope } = await import("@/lib/remote-account-epoch");
const { refreshCanonicalOrders } = await import("./order-canonical");

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  state.list.mockReset();
  state.report.mockReset();
  remoteAccountScope.bind("A");
});

it("drops a canonical order response after the account generation changes", async () => {
  const pending = deferred<{ orders: Array<{ orderNo: string; canonicalStatus: string }> }>();
  state.list.mockReturnValue(pending.promise);
  const refresh = refreshCanonicalOrders(true);

  remoteAccountScope.bind("B");
  pending.resolve({ orders: [{ orderNo: "ORDER-A", canonicalStatus: "paid" }] });

  await expect(refresh).resolves.toBe(false);
  expect(state.report).not.toHaveBeenCalled();
});
