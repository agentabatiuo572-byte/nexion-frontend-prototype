import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";

export interface NetworkRegion {
  id: string;
  displayName: string;
  location: string;
  activeNodes: number;
  activeJobs: number;
  jobsPerHour: number;
  latitude: number | null;
  longitude: number | null;
  isUserRegion: boolean;
}

export interface NetworkRegionProjection {
  activeNodes: number;
  activeJobs: number;
  countryCount: number;
  regions: NetworkRegion[];
  source: "server";
  generatedAt: string;
}

export interface NetworkRegionsApi { list(): Promise<NetworkRegionProjection> }

function invalid(): never {
  throw new ApiError({ kind: "protocol", message: "NETWORK_REGIONS_RESPONSE_INVALID" });
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return invalid();
  return value;
}

function string(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return invalid();
  return value.trim();
}

function nullableCoordinate(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return invalid();
  return value;
}

function region(value: unknown): NetworkRegion {
  const row = record(value);
  if (typeof row.isUserRegion !== "boolean") return invalid();
  return {
    id: string(row.id),
    displayName: string(row.displayName),
    location: string(row.location),
    activeNodes: integer(row.activeNodes),
    activeJobs: integer(row.activeJobs),
    jobsPerHour: integer(row.jobsPerHour),
    latitude: nullableCoordinate(row.latitude, -90, 90),
    longitude: nullableCoordinate(row.longitude, -180, 180),
    isUserRegion: row.isUserRegion,
  };
}

function projection(value: unknown): NetworkRegionProjection {
  const row = record(value);
  if (!Array.isArray(row.regions) || row.source !== "server") return invalid();
  const regions = row.regions.map(region);
  if (new Set(regions.map((entry) => entry.id)).size !== regions.length) return invalid();
  const activeNodes = integer(row.activeNodes);
  const activeJobs = integer(row.activeJobs);
  const countryCount = integer(row.countryCount);
  if (activeNodes !== regions.reduce((sum, entry) => sum + entry.activeNodes, 0)
      || activeJobs !== regions.reduce((sum, entry) => sum + entry.activeJobs, 0)) return invalid();
  const generatedAt = string(row.generatedAt);
  if (!Number.isFinite(Date.parse(generatedAt))) return invalid();
  return { activeNodes, activeJobs, countryCount, regions, source: "server", generatedAt };
}

export function createNetworkRegionsApi(client: ApiClient): NetworkRegionsApi {
  return { async list() { return projection(await client.request<unknown>({ path: "/api/app/network/regions" })); } };
}
