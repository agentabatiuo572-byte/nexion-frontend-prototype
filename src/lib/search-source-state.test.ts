import { describe, expect, it } from "vitest";
import { resolveSearchResultState } from "./search-source-state";

describe("search result source isolation", () => {
  it("does not report no match before published FAQ loading completes", () => {
    expect(resolveSearchResultState({
      hasQuery: true, remoteCatalogueStatus: "ready", remoteNetworkStatus: "ready",
      remoteFleetStatus: "ready", remoteFaqStatus: "loading", resultCount: 0,
    })).toEqual({ body: "loading", showSourceError: false });
  });

  it("keeps published FAQ failures retryable alongside independent page hits", () => {
    expect(resolveSearchResultState({
      hasQuery: true, remoteCatalogueStatus: "ready", remoteNetworkStatus: "ready",
      remoteFleetStatus: "ready", remoteFaqStatus: "error", resultCount: 1,
    })).toEqual({ body: "results", showSourceError: true });
  });

  const complete = {
    remoteCatalogueStatus: "ready" as const,
    remoteNetworkStatus: "ready" as const,
    remoteFleetStatus: "ready" as const,
    remoteFleetHasSnapshot: true,
  };

  it("does not conclude no results while members are still loading after the catalogue is ready", () => {
    expect(resolveSearchResultState({
      hasQuery: true,
      ...complete,
      remoteNetworkStatus: "loading",
      resultCount: 0,
    })).toEqual({ body: "loading", showSourceError: false });
  });

  it("keeps independently available hits visible when a remote source fails", () => {
    expect(resolveSearchResultState({
      hasQuery: true,
      ...complete,
      remoteNetworkStatus: "error",
      resultCount: 1,
    })).toEqual({ body: "results", showSourceError: true });
  });

  it("keeps the failure recoverable when a failed source leaves no independently ready hit", () => {
    expect(resolveSearchResultState({
      hasQuery: true,
      ...complete,
      remoteFleetStatus: "error",
      resultCount: 0,
    })).toEqual({ body: "recoverable-error", showSourceError: false });
  });

  it("keeps retry available when another source is still reading after a source failure", () => {
    expect(resolveSearchResultState({
      hasQuery: true,
      ...complete,
      remoteNetworkStatus: "error",
      remoteFleetStatus: "loading",
      resultCount: 0,
    })).toEqual({ body: "recoverable-error", showSourceError: false });
  });

  it("reaches a definite empty state only when every actual remote source is ready", () => {
    expect(resolveSearchResultState({
      hasQuery: true,
      ...complete,
      resultCount: 0,
    })).toEqual({ body: "empty", showSourceError: false });
  });

  it("treats an idle device-fleet source as unread rather than silently ready", () => {
    expect(resolveSearchResultState({
      hasQuery: true,
      ...complete,
      remoteFleetStatus: "idle",
      remoteFleetHasSnapshot: false,
      resultCount: 0,
    })).toEqual({ body: "loading", showSourceError: false });
  });

  it("keeps a confirmed same-account fleet snapshot searchable during its next refresh", () => {
    expect(resolveSearchResultState({
      hasQuery: true,
      ...complete,
      remoteFleetStatus: "loading",
      remoteFleetHasSnapshot: true,
      resultCount: 0,
    })).toEqual({ body: "empty", showSourceError: false });
  });

  it("keeps a first fleet read loading until its own snapshot is confirmed", () => {
    expect(resolveSearchResultState({
      hasQuery: true,
      ...complete,
      remoteFleetStatus: "loading",
      remoteFleetHasSnapshot: false,
      resultCount: 0,
    })).toEqual({ body: "loading", showSourceError: false });
  });

  it("keeps a failed refresh recoverable even when the prior fleet snapshot remains readable", () => {
    expect(resolveSearchResultState({
      hasQuery: true,
      ...complete,
      remoteFleetStatus: "error",
      remoteFleetHasSnapshot: true,
      resultCount: 1,
    })).toEqual({ body: "results", showSourceError: true });
  });
});
