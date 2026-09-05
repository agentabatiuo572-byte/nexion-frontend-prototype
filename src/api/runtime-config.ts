export type ApiMode = "mock" | "sandbox" | "remote";
export type ApiEnvironment = "mock";
export type ApiResponseEnvironment = "mock" | "dev" | "prod";

export interface ApiRuntimeConfig {
  environment: ApiEnvironment;
  baseUrl: "";
}

/** The high-fidelity App is a self-contained mock and never reads a mode flag. */
export function readApiRuntimeConfig(): ApiRuntimeConfig {
  return { environment: "mock", baseUrl: "" };
}
