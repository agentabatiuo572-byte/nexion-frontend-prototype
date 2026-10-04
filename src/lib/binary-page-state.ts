export type RemoteReadStatus = "idle" | "loading" | "ready" | "error";

export interface BinaryPageState {
  primary: "loading" | "ready" | "error";
  memberDetails: "loading" | "ready" | "error";
}

/** Keeps the F3 settlement projection independent from optional member details. */
export function binaryPageState(input: {
  remote: boolean;
  binaryStatus: RemoteReadStatus;
  networkStatus: RemoteReadStatus;
}): BinaryPageState {
  if (!input.remote) return { primary: "ready", memberDetails: "ready" };
  return {
    primary: input.binaryStatus === "ready" ? "ready" : input.binaryStatus === "error" ? "error" : "loading",
    memberDetails: input.networkStatus === "error" ? "error" : input.networkStatus === "ready" ? "ready" : "loading",
  };
}
