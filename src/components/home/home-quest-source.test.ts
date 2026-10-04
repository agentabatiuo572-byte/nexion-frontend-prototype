import { describe, expect, it } from "vitest";

import { selectHomeQuestRows } from "./home-quest-source";

describe("selectHomeQuestRows", () => {
  const mockRows = [{ id: "mock" }];
  const remoteRows = [{ id: "remote" }];

  it("keeps fixed mock rows only for the prototype runtime", () => {
    expect(selectHomeQuestRows(false, false, remoteRows, mockRows)).toEqual(mockRows);
  });

  it("shows Java H3 rows only after the remote source is ready", () => {
    expect(selectHomeQuestRows(true, true, remoteRows, mockRows)).toEqual(remoteRows);
  });

  it("fails closed instead of exposing mock task names while remote data is unavailable", () => {
    expect(selectHomeQuestRows(true, false, remoteRows, mockRows)).toEqual([]);
  });
});
