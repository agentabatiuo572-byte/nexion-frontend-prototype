import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const platformConfig = vi.hoisted(() => vi.fn());

vi.mock("@/api/runtime", () => ({
  remoteApiEnabled: false,
  platformConfigApi: { platformConfig },
}));

import { useConfig } from "./config";

describe("high-fidelity mock configuration", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    platformConfig.mockReset();
  });

  it("uses the local mock seed without requesting a backend projection", async () => {
    const config = useConfig();
    await config.load();

    expect(platformConfig).not.toHaveBeenCalled();
    expect(config.syncFailed).toBe(false);
  });
});
