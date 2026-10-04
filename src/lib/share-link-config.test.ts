import { createPinia, setActivePinia } from "pinia";
import { beforeEach, expect, it } from "vitest";

import { useConfig } from "@/store/config";
import { buildShareLink } from "./share";

beforeEach(() => setActivePinia(createPinia()));

it("uses only a ready server share base for a native invite link", () => {
  const config = useConfig();
  expect(buildShareLink("NXTEST311")).toBe("");
  config.config.share.baseUrl = "https://nexgrid.ai/ref/";
  config.configStatus = "ready";
  expect(buildShareLink("NXTEST311")).toBe("https://nexgrid.ai/ref/NXTEST311");
  config.configStatus = "failed";
  expect(buildShareLink("NXTEST311")).toBe("");
  config.configStatus = "ready";
  config.config.share.baseUrl = "";
  expect(buildShareLink("NXTEST311")).toBe("");
});
