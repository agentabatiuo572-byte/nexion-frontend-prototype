import { expect, it } from "vitest";
import { apiEnvironmentBadgeLabel } from "./runtime-config";

it("labels the configured TEST API without calling it a local development service", () => {
  const localLabel = "Development environment · local Java service";
  expect(apiEnvironmentBadgeLabel({ environment: "dev", baseUrl: "https://18.142.169.24" }, localLabel))
    .toBe("UVEL TEST");
  expect(apiEnvironmentBadgeLabel({ environment: "dev", baseUrl: "http://127.0.0.1:5173" }, localLabel))
    .toBe(localLabel);
  expect(apiEnvironmentBadgeLabel({ environment: "dev", baseUrl: "https://18.142.169.24.example.com" }, localLabel))
    .toBe("");
  expect(apiEnvironmentBadgeLabel({ environment: "prod", baseUrl: "https://api.example.com" }, localLabel))
    .toBe("");
});
