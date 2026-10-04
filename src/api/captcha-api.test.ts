import { expect, test, vi } from "vitest";
import { createCaptchaApi } from "./captcha-api";
const valid = {challengeId:"challenge-0123456789abcdef",backgroundImage:"data:image/png;base64,aGVsbG8=",pieceImage:"data:image/png;base64,aGVsbG8=",width:320,height:160,pieceWidth:44,pieceHeight:44,pieceY:40,expiresInSec:120};
test("loads anonymous server challenge without exposing an answer", async () => {
  const request=vi.fn().mockResolvedValue({...valid,targetX:200});
  const result=await createCaptchaApi({request} as never).challenge("REGISTER");
  expect(result).toEqual(valid);
  expect(request).toHaveBeenCalledWith({path:"/api/auth/captcha/challenge",method:"POST",authenticated:false,body:{scene:"REGISTER"}});
});
test.each([{backgroundImage:"javascript:alert(1)"},{pieceY:150},{width:0},{expiresInSec:0},{challengeId:"short"}])("rejects malformed challenge %j", async patch => {
  const api=createCaptchaApi({request:vi.fn().mockResolvedValue({...valid,...patch})} as never);
  await expect(api.challenge("LOGIN")).rejects.toThrow("CAPTCHA_RESPONSE_INVALID");
});
test("forwards the server proof and returns only its opaque ticket", async () => {
  const request=vi.fn().mockResolvedValue({ticket:"ticket-0123456789abcdef",expiresInSec:60});
  const proof={scene:"RESET" as const,challengeId:valid.challengeId,offsetX:170,trail:[{x:0,t:0},{x:170,t:900}],inputMethod:"pointer" as const};
  expect(await createCaptchaApi({request} as never).verify(proof)).toEqual({ticket:"ticket-0123456789abcdef",expiresInSec:60});
  expect(request).toHaveBeenCalledWith({path:"/api/auth/captcha/verify",method:"POST",authenticated:false,body:proof});
});
test("does not fabricate a ticket on network failure", async () => {
  const api=createCaptchaApi({request:vi.fn().mockRejectedValue(new Error("network"))} as never);
  await expect(api.verify({scene:"LOGIN",challengeId:valid.challengeId,offsetX:1,trail:[],inputMethod:"keyboard"})).rejects.toThrow("network");
});
