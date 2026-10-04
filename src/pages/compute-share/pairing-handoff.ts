export interface ComputeSharePairingHandoffInput {
  enrollmentNo: string;
  pairingCode: string;
  requestedGpuModel: string;
  expiresAt: string;
}

const ENROLLMENT_NO = /^CSE-[A-Z0-9]{1,64}$/;
const PAIRING_CODE = /^\d{6}$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;

function invalid(): never {
  throw new Error("COMPUTE_SHARE_HANDOFF_INVALID");
}

export function createComputeSharePairingHandoff(input: ComputeSharePairingHandoffInput): string {
  const enrollmentNo = input.enrollmentNo.trim().toUpperCase();
  const pairingCode = input.pairingCode.trim();
  const requestedGpuModel = input.requestedGpuModel.trim();
  const expiresAt = input.expiresAt.trim();
  const expiresAtMs = Date.parse(expiresAt);

  if (!ENROLLMENT_NO.test(enrollmentNo)
      || !PAIRING_CODE.test(pairingCode)
      || requestedGpuModel.length < 3
      || requestedGpuModel.length > 128
      || CONTROL_CHARACTER.test(requestedGpuModel)
      || !Number.isFinite(expiresAtMs)) invalid();

  const payload = new URL("nexgrid://compute-share/pair");
  payload.searchParams.set("v", "1");
  payload.searchParams.set("enrollmentNo", enrollmentNo);
  payload.searchParams.set("pairingCode", pairingCode);
  payload.searchParams.set("requestedGpuModel", requestedGpuModel);
  payload.searchParams.set("expiresAt", new Date(expiresAtMs).toISOString());
  return payload.toString();
}
