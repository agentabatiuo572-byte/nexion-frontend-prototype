import type { ApiClient } from "./api-client";
import { ApiError } from "./errors";
import type { LocaleCode } from "@/i18n";

export interface ProfileApi {
  profile(): Promise<ProfileProjection>;
  nicknameCandidates(): Promise<string[]>;
  updateNickname(expectedNickname: string, nickname: string, idempotencyKey: string): Promise<string>;
  updateLanguage(language: string): Promise<string>;
  uploadAvatar(filePath: string, idempotencyKey: string): Promise<ProfileAvatar>;
}

export interface ProfileProjection {
  nickname: string;
  avatarUrl: string;
  avatarRevision: string;
  language: LocaleCode;
}

export interface ProfileAvatar {
  avatarUrl: string;
  avatarRevision: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validNickname(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z]+ [A-Za-z]+ [1-9][0-9]$/.test(value);
}

function validExistingNickname(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 64;
}

function key(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new ApiError({ kind: "protocol", message: "PROFILE_IDEMPOTENCY_KEY_REQUIRED" });
  return normalized;
}

const PROFILE_LANGUAGES = new Set<LocaleCode>(["en", "vi", "zh", "ja", "ko", "ru", "es", "pt", "ar", "de", "fr"]);

function isProfileLanguage(value: unknown): value is LocaleCode {
  return typeof value === "string" && PROFILE_LANGUAGES.has(value as LocaleCode);
}

function language(value: string): LocaleCode {
  if (!isProfileLanguage(value)) {
    throw new ApiError({ kind: "protocol", message: "PROFILE_LANGUAGE_INVALID" });
  }
  return value;
}

function parseProjection(value: unknown): ProfileProjection {
  const row = record(value);
  if (!row || !validExistingNickname(row.nickname)
      || typeof row.avatarUrl !== "string"
      || typeof row.avatarRevision !== "string"
      || !isProfileLanguage(row.language)
      || (!!row.avatarUrl && !/^https?:\/\//i.test(row.avatarUrl))) {
    throw new ApiError({ kind: "protocol", message: "PROFILE_RESPONSE_INVALID" });
  }
  return {
    nickname: row.nickname,
    avatarUrl: row.avatarUrl,
    avatarRevision: row.avatarRevision,
    language: row.language,
  };
}

function parseAvatar(value: unknown): ProfileAvatar {
  const row = record(value);
  if (!row || row.status !== "UPDATED"
      || typeof row.avatarUrl !== "string" || !/^https?:\/\//i.test(row.avatarUrl)
      || typeof row.avatarRevision !== "string" || !/^[a-f0-9]{64}$/i.test(row.avatarRevision)) {
    throw new ApiError({ kind: "protocol", message: "PROFILE_AVATAR_RESPONSE_INVALID" });
  }
  return { avatarUrl: row.avatarUrl, avatarRevision: row.avatarRevision };
}

export function createProfileApi(client: ApiClient): ProfileApi {
  return {
    profile: async () => parseProjection(await client.request({ method: "GET", path: "/api/app/profile" })),
    nicknameCandidates: async () => {
      const row = record(await client.request({ method: "GET", path: "/api/app/profile/nickname-candidates" }));
      if (!row || !Array.isArray(row.candidates) || row.candidates.length !== 6
          || row.candidates.some((candidate) => !validNickname(candidate))
          || new Set(row.candidates).size !== row.candidates.length) {
        throw new ApiError({ kind: "protocol", message: "PROFILE_CANDIDATES_RESPONSE_INVALID" });
      }
      return [...row.candidates];
    },
    updateNickname: async (expectedNickname, nickname, idempotencyKey) => {
      const row = record(await client.request({
        method: "PUT",
        path: "/api/app/profile",
        body: { expectedNickname, nickname },
        idempotencyKey: key(idempotencyKey),
      }));
      if (!row || !validNickname(row.nickname) || !["UPDATED", "UNCHANGED"].includes(String(row.status))) {
        throw new ApiError({ kind: "protocol", message: "PROFILE_UPDATE_RESPONSE_INVALID" });
      }
      return row.nickname;
    },
    updateLanguage: async (nextLanguage) => {
      const expected = language(nextLanguage);
      const row = record(await client.request({
        method: "PUT",
        path: "/api/app/profile/language",
        body: { language: expected },
      }));
      if (!row || row.language !== expected || Object.keys(row).some((entry) => entry !== "language" && entry !== "status")) {
        throw new ApiError({ kind: "protocol", message: "PROFILE_LANGUAGE_RESPONSE_INVALID" });
      }
      return expected;
    },
    uploadAvatar: async (filePath, idempotencyKey) => parseAvatar(await client.upload({
      path: "/api/app/profile/avatar",
      filePath,
      name: "file",
      idempotencyKey: key(idempotencyKey),
    })),
  };
}
