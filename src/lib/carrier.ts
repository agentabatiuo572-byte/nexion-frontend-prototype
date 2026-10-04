// Front-end carrier (shell) detection — device registration metadata and the
// mock resident-heartbeat source.
//
// SPEC-1 R7: carrier is not an earnings/display factor. The signed App may stamp
// onlineHeartbeatAt; H5 never does. Both shells then read the same device online
// state through isDeviceOnline().
//
// PROD keeps carrier only as intrinsic client metadata. The candidate contract
// `POST /api/device/:id/heartbeat` (PRD §6.11/§12.2) produces the server-canonical
// device state used by the online factor.

export type Carrier = "app" | "h5";

export function getCarrier(): Carrier {
  let carrier: Carrier = "h5"; // H5 / mp-* do not produce resident heartbeats
  // #ifdef APP-PLUS
  carrier = "app";
  // #endif
  return carrier;
}
