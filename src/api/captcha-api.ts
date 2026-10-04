import type { ApiClient } from "./api-client";
export type CaptchaScene = "REGISTER" | "LOGIN" | "RESET";
export interface ServerCaptchaChallenge {
  challengeId: string; backgroundImage: string; pieceImage: string;
  width: number; height: number; pieceWidth: number; pieceHeight: number; pieceY: number; expiresInSec: number;
}
export interface CaptchaProof {
  scene: CaptchaScene; challengeId: string; offsetX: number;
  trail: Array<{ x: number; t: number }>; inputMethod: "pointer" | "keyboard";
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("CAPTCHA_RESPONSE_INVALID");
  return value as Record<string, unknown>;
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) throw new Error("CAPTCHA_RESPONSE_INVALID");
  return value;
}
function opaque(value: unknown): string {
  if (typeof value !== "string" || value.length < 16 || value.length > 2048 || !/^[A-Za-z0-9_:-]+$/.test(value)) throw new Error("CAPTCHA_RESPONSE_INVALID");
  return value;
}
function png(value: unknown): string {
  if (typeof value !== "string" || value.length > 800000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error("CAPTCHA_RESPONSE_INVALID");
  return value;
}
export function createCaptchaApi(client: ApiClient) {
  return {
    async challenge(scene: CaptchaScene): Promise<ServerCaptchaChallenge> {
      const data = record(await client.request({ path: "/api/auth/captcha/challenge", method: "POST", authenticated: false, body: {scene} }));
      const width = integer(data.width, 100, 1024), height = integer(data.height, 60, 512);
      const pieceWidth = integer(data.pieceWidth, 10, width - 1), pieceHeight = integer(data.pieceHeight, 10, height);
      return { challengeId: opaque(data.challengeId), backgroundImage: png(data.backgroundImage), pieceImage: png(data.pieceImage), width, height, pieceWidth, pieceHeight,
        pieceY: integer(data.pieceY, 0, height - pieceHeight), expiresInSec: integer(data.expiresInSec, 1, 600) };
    },
    async verify(proof: CaptchaProof): Promise<{ticket: string; expiresInSec: number}> {
      const data = record(await client.request({ path: "/api/auth/captcha/verify", method: "POST", authenticated: false, body: proof }));
      return { ticket: opaque(data.ticket), expiresInSec: integer(data.expiresInSec, 1, 600) };
    },
  };
}
