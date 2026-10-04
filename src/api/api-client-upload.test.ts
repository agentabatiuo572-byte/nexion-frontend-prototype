import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient, createUniHttpTransport } from "./api-client";
import { createSessionVault } from "./session-vault";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("API multipart upload", () => {
  it("sends the in-memory bearer and idempotency key and decodes uni.uploadFile JSON", async () => {
    const vault = createSessionVault();
    vault.save({
      accessToken: "access",
      refreshToken: "refresh",
      tokenType: "Bearer",
      user: { userId: 42, countryCode: "+84", phone: "912345678", nickname: "NexGrid 5678", onboardingComplete: true },
    });
    const upload = vi.fn().mockResolvedValue({
      status: 200,
      data: JSON.stringify({ code: 0, message: "OK", data: { status: "UPDATED" } }),
      headers: {},
    });
    const api = createApiClient({
      baseUrl: "http://127.0.0.1:8110",
      vault,
      transport: { request: vi.fn(), upload },
    });

    await expect(api.upload({
      path: "/api/app/profile/avatar",
      filePath: "blob:avatar",
      idempotencyKey: "avatar-key",
      formData: { clientUploadId: "upload-12345678" },
    })).resolves.toEqual({ status: "UPDATED" });
    expect(upload).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://127.0.0.1:8110/api/app/profile/avatar",
      filePath: "blob:avatar",
      name: "file",
      headers: { Authorization: "Bearer access", "Idempotency-Key": "avatar-key" },
      formData: { clientUploadId: "upload-12345678" },
    }));
  });
  it("downloads private bytes with bearer and rejects stale account results", async () => {
    const vault = createSessionVault();
    const identity = { userId: 42, countryCode: "+84", phone: "912345678", nickname: "Client", onboardingComplete: true };
    vault.save({ accessToken: "access", refreshToken: "refresh", tokenType: "Bearer", user: identity });
    let finish!: (value: { status: number; filePath: string }) => void;
    const download = vi.fn(() => new Promise<{ status: number; filePath: string }>(resolve => { finish = resolve; }));
    const api = createApiClient({ baseUrl: "http://127.0.0.1:8110", vault, transport: { request: vi.fn(), download } });
    const pending = api.download!({ path: "/api/app/support/attachments/private-1/content" });
    expect(download).toHaveBeenCalledWith(expect.objectContaining({
      url: "http://127.0.0.1:8110/api/app/support/attachments/private-1/content",
      headers: { Authorization: "Bearer access", "Cache-Control": "no-store" },
    }));
    vault.clear();
    finish({ status: 200, filePath: "private-temp-file" });
    await expect(pending).rejects.toThrow("SESSION_CHANGED_DURING_REQUEST");
  });
  it("keeps H5 private bytes out of uni.downloadFile and only creates a URL after identity validation", async () => {
    const vault = createSessionVault();
    vault.save({ accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
      user: { userId: 42, countryCode: "+84", phone: "912345678", nickname: "Client", onboardingComplete: true } });
    const uniDownload = vi.fn(() => { throw new Error("private bytes entered uni file cache"); });
    vi.stubGlobal("uni", { downloadFile: uniDownload });
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:private-owned");
    const fetchMock = vi.fn(async () => new Response(new Blob(["private bytes"]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createApiClient({ baseUrl: "http://127.0.0.1:8110", vault, transport: createUniHttpTransport() });
    await expect(api.download!({ path: "/api/app/support/attachments/private-1/content" })).resolves.toBe("blob:private-owned");
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8110/api/app/support/attachments/private-1/content",
      expect.objectContaining({ method: "GET", cache: "no-store", headers: expect.objectContaining({ Authorization: "Bearer access" }) }));
    expect(uniDownload).not.toHaveBeenCalled();
    expect(createUrl).toHaveBeenCalledTimes(1);
  });
  it("does not create a private URL when the account changes before H5 bytes finish", async () => {
    const vault = createSessionVault();
    vault.save({ accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
      user: { userId: 42, countryCode: "+84", phone: "912345678", nickname: "Client", onboardingComplete: true } });
    let finish!: (blob: Blob) => void;
    let reading!: () => void;
    const started = new Promise<void>(resolve => { reading = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      blob: () => { reading(); return new Promise<Blob>(resolve => { finish = resolve; }); } })));
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:should-not-exist");
    const api = createApiClient({ baseUrl: "http://127.0.0.1:8110", vault, transport: createUniHttpTransport() });
    const pending = api.download!({ path: "/api/app/support/attachments/private-1/content" });
    await started;
    vault.clear();
    finish(new Blob(["private bytes"]));
    await expect(pending).rejects.toThrow("SESSION_CHANGED_DURING_REQUEST");
    expect(createUrl).not.toHaveBeenCalled();
  });
  it("rejects an aborted H5 download before creating any private URL", async () => {
    const vault = createSessionVault();
    vault.save({ accessToken: "access", refreshToken: "refresh", tokenType: "Bearer",
      user: { userId: 42, countryCode: "+84", phone: "912345678", nickname: "Client", onboardingComplete: true } });
    let finish!: (blob: Blob) => void;
    let reading!: () => void;
    const started = new Promise<void>(resolve => { reading = resolve; });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200,
      blob: () => { reading(); return new Promise<Blob>(resolve => { finish = resolve; }); } })));
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:should-not-exist");
    const api = createApiClient({ baseUrl: "http://127.0.0.1:8110", vault, transport: createUniHttpTransport() });
    const controller = new AbortController();
    const pending = api.download!({ path: "/api/app/support/attachments/private-1/content", signal: controller.signal });
    await started;
    controller.abort();
    finish(new Blob(["private bytes"]));
    await expect(pending).rejects.toThrow("REQUEST_ABORTED");
    expect(createUrl).not.toHaveBeenCalled();
  });
});
