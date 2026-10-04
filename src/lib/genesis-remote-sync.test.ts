import { describe, expect, it, vi } from "vitest";
import { readGenesisRemoteFacts } from "./genesis-remote-sync";
import type { GenesisAccountState, GenesisEligibility, GenesisPublicState } from "@/api/genesis-api";
import { ApiError } from "@/api/errors";

function eligibility(): GenesisEligibility {
  return {
    sourceEnvironment: "PRODUCTION",
    runId: "",
    eligible: true,
    reasons: ["HOLDINGS_CONFIRMED"],
    ownedCount: 10,
    maxPerUser: 20,
    remainingCap: 10,
    minAccountAgeDays: 0,
    accountAgeDays: 1,
    holderStatus: "READY",
    reservedAllocation: 800002.5,
    reservedAllocationUnit: "NEX",
    priorityRank: 1,
    priorityTier: "TOP_1",
    qualificationReasonCodes: ["HOLDINGS_CONFIRMED", "POLICY_CONFIRMED"],
    policyVersion: "genesis-holder-v1",
    effectiveAt: Date.parse("2026-08-17T00:00:00Z"),
    asOf: Date.parse("2026-08-18T07:18:13Z"),
    serverTime: Date.parse("2026-08-18T07:18:13Z"),
    provenance: {
      source: "nx_genesis_holding+nx_config_item",
      environment: "PRODUCTION",
      runId: "",
    },
  };
}

function account(): GenesisAccountState {
  return { eligibility: eligibility() } as GenesisAccountState;
}

describe("Genesis remote fact orchestration", () => {
  const unavailable = () => new ApiError({ kind: "http", status: 503, code: 503, message: "GENESIS_SERIES_UNAVAILABLE" });
  function failedScope(current = true, authority = true) {
    return { hasAuthority: () => authority, isCurrent: () => current,
      clear: vi.fn(), clearAccount: vi.fn(), clearPublic: vi.fn(),
      applyPublicError: vi.fn(), applyEligibilityError: vi.fn(),
      applyPublicState: vi.fn(), applyAccount: vi.fn(), applyEligibility: vi.fn() };
  }
  it("preserves an explicit missing-series classification after clearing failed facts", async () => {
    const scope = failedScope();
    const api = { state: vi.fn().mockRejectedValue(unavailable()), account: vi.fn().mockRejectedValue(unavailable()),
      eligibility: vi.fn().mockRejectedValue(unavailable()) };
    expect(await readGenesisRemoteFacts(api, scope)).toBe(false);
    expect(scope.clear).toHaveBeenCalledOnce();
    expect(scope.applyPublicError).toHaveBeenCalledWith("GENESIS_SERIES_UNAVAILABLE");
    expect(scope.applyEligibilityError).toHaveBeenCalledWith("GENESIS_SERIES_UNAVAILABLE");
    expect(scope.clear.mock.invocationCallOrder[0]).toBeLessThan(scope.applyPublicError.mock.invocationCallOrder[0]);
    expect(scope.applyAccount).not.toHaveBeenCalled();
    expect(scope.applyEligibility).not.toHaveBeenCalled();
  });
  it.each([
    new Error("GENESIS_SERIES_UNAVAILABLE"),
    new ApiError({kind:"http",status:503,code:503,message:"genesis_series_unavailable"}),
    new ApiError({kind:"http",status:500,code:503,message:"GENESIS_SERIES_UNAVAILABLE"}),
    new ApiError({kind:"http",status:503,code:500,message:"GENESIS_SERIES_UNAVAILABLE"}),
    new ApiError({kind:"auth",status:503,code:503,message:"GENESIS_SERIES_UNAVAILABLE"}),
    new ApiError({kind:"network",message:"private database detail"}),
  ])("does not classify other errors as unpublished or expose raw detail: %s", async (error) => {
    const scope=failedScope();
    await readGenesisRemoteFacts({state:async()=>{throw error;}, account:async()=>{throw unavailable();},
      eligibility:async()=>{throw error;}},scope);
    expect(scope.applyPublicError).toHaveBeenCalledWith("GENESIS_PUBLIC_UNAVAILABLE");
    expect(scope.applyEligibilityError).toHaveBeenCalledWith("GENESIS_ELIGIBILITY_UNAVAILABLE");
  });
  it("classifies anonymous public failure without reading or claiming account facts", async () => {
    const scope=failedScope(true,false);
    const api={state:vi.fn().mockRejectedValue(unavailable()),account:vi.fn(),eligibility:vi.fn()};
    await readGenesisRemoteFacts(api,scope);
    expect(scope.applyPublicError).toHaveBeenCalledWith("GENESIS_SERIES_UNAVAILABLE");
    expect(scope.applyEligibilityError).not.toHaveBeenCalled();
    expect(api.account).not.toHaveBeenCalled();expect(api.eligibility).not.toHaveBeenCalled();
  });
  it("never commits a missing-series error from an old account/run", async () => {
    const scope=failedScope(false);
    await readGenesisRemoteFacts({state:async()=>{throw unavailable();},account:async()=>{throw unavailable();},
      eligibility:async()=>{throw unavailable();}},scope);
    expect(scope.clear).not.toHaveBeenCalled();expect(scope.applyPublicError).not.toHaveBeenCalled();
    expect(scope.applyEligibilityError).not.toHaveBeenCalled();
  });
  it("keeps holder facts when the unrelated public state projection is unavailable", async () => {
    const applied: { account?: GenesisAccountState; eligibility?: GenesisEligibility } = {};
    const applyPublicState = vi.fn();
    const clearPublic = vi.fn();
    const api = {
      state: vi.fn<() => Promise<GenesisPublicState>>().mockRejectedValue(new Error("PUBLIC_STATE_SCHEMA_MISMATCH")),
      account: vi.fn<() => Promise<GenesisAccountState>>().mockResolvedValue(account()),
      eligibility: vi.fn<() => Promise<GenesisEligibility>>().mockResolvedValue(eligibility()),
    };

    await expect(readGenesisRemoteFacts(api, {
      hasAuthority: () => true,
      isCurrent: () => true,
      clear: vi.fn(),
      clearPublic,
      clearAccount: vi.fn(),
      applyPublicState,
      applyAccount: (value) => { applied.account = value; },
      applyEligibility: (value) => { applied.eligibility = value; },
    })).resolves.toBe(true);

    expect(applied.account?.eligibility?.holderStatus).toBe("READY");
    expect(applied.eligibility?.reservedAllocation).toBe(800002.5);
    expect(applyPublicState).not.toHaveBeenCalled();
    expect(clearPublic).toHaveBeenCalledOnce();
  });

  it("applies the authenticated account projection after public state so its scoped supply stays visible", async () => {
    const calls: string[] = [];
    const api = {
      state: vi.fn<() => Promise<GenesisPublicState>>().mockResolvedValue({} as GenesisPublicState),
      account: vi.fn<() => Promise<GenesisAccountState>>().mockResolvedValue(account()),
      eligibility: vi.fn<() => Promise<GenesisEligibility>>().mockResolvedValue(eligibility()),
    };

    await readGenesisRemoteFacts(api, {
      hasAuthority: () => true,
      isCurrent: () => true,
      clear: vi.fn(),
      clearAccount: vi.fn(),
      applyPublicState: () => { calls.push("public"); },
      applyAccount: () => { calls.push("account"); },
      applyEligibility: () => { calls.push("eligibility"); },
    });

    expect(calls).toEqual(["public", "account", "eligibility"]);
  });

  it("keeps a successful account projection (order history) when eligibility alone is unavailable", async () => {
    // BUG 174: 资格与账号投影是两件独立的事。绑定同一可用性会让「Genesis 未开放 /
    // 资格不可用」把已经读到的订单历史一起清空,订单页随即把资格故障升级成
    // 「订单目录同步失败」并同时渲染「还没有订单」。
    const applied: { account?: GenesisAccountState } = {};
    const clearAccount = vi.fn();
    const applyEligibilityError = vi.fn();
    const api = {
      state: vi.fn<() => Promise<GenesisPublicState>>().mockResolvedValue({} as GenesisPublicState),
      account: vi.fn<() => Promise<GenesisAccountState>>().mockResolvedValue(account()),
      eligibility: vi.fn<() => Promise<GenesisEligibility>>().mockRejectedValue(new ApiError({
        kind: "business", message: "GENESIS_ELIGIBILITY_UNAVAILABLE", status: 409, code: 409,
      })),
    };

    await expect(readGenesisRemoteFacts(api, {
      hasAuthority: () => true,
      isCurrent: () => true,
      clear: vi.fn(),
      clearAccount,
      applyPublicState: vi.fn(),
      applyAccount: (value) => { applied.account = value; },
      applyEligibility: vi.fn(),
      applyEligibilityError,
    })).resolves.toBe(true);

    expect(clearAccount).not.toHaveBeenCalled();
    expect(applied.account?.eligibility?.holderStatus).toBe("READY");
    expect(applyEligibilityError).toHaveBeenCalledWith("GENESIS_ELIGIBILITY_UNAVAILABLE");
  });

  it("keeps public supply facts when protected account projections are unavailable", async () => {
    const publicState = {} as GenesisPublicState;
    const clear = vi.fn();
    const clearAccount = vi.fn();
    const applyPublicState = vi.fn();
    const api = {
      state: vi.fn<() => Promise<GenesisPublicState>>().mockResolvedValue(publicState),
      account: vi.fn<() => Promise<GenesisAccountState>>().mockRejectedValue(new Error("ACCOUNT_UNAVAILABLE")),
      eligibility: vi.fn<() => Promise<GenesisEligibility>>().mockRejectedValue(new Error("ELIGIBILITY_UNAVAILABLE")),
    };

    await expect(readGenesisRemoteFacts(api, {
      hasAuthority: () => true,
      isCurrent: () => true,
      clear,
      clearAccount,
      applyPublicState,
      applyAccount: vi.fn(),
      applyEligibility: vi.fn(),
    })).resolves.toBe(true);

    expect(clear).not.toHaveBeenCalled();
    expect(clearAccount).toHaveBeenCalledOnce();
    expect(applyPublicState).toHaveBeenCalledWith(publicState);
  });

  it("maps protected-read failures to one stable unavailable reason", async () => {
    const publicState = {} as GenesisPublicState;
    const applyEligibilityError = vi.fn();
    const isolationError = new ApiError({
      kind: "business",
      message: "GENESIS_ELIGIBILITY_UNAVAILABLE",
      status: 409,
      code: 409,
    });
    const api = {
      state: vi.fn<() => Promise<GenesisPublicState>>().mockResolvedValue(publicState),
      account: vi.fn<() => Promise<GenesisAccountState>>().mockRejectedValue(isolationError),
      eligibility: vi.fn<() => Promise<GenesisEligibility>>().mockRejectedValue(isolationError),
    };

    await expect(readGenesisRemoteFacts(api, {
      hasAuthority: () => true,
      isCurrent: () => true,
      clear: vi.fn(),
      clearAccount: vi.fn(),
      applyEligibilityError,
      applyPublicState: vi.fn(),
      applyAccount: vi.fn(),
      applyEligibility: vi.fn(),
    })).resolves.toBe(true);

    expect(applyEligibilityError).toHaveBeenCalledWith("GENESIS_ELIGIBILITY_UNAVAILABLE");
  });

  it("logs only stable protected-read categories and never raw backend messages", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const api = {
      state: vi.fn<() => Promise<GenesisPublicState>>().mockResolvedValue({} as GenesisPublicState),
      account: vi.fn<() => Promise<GenesisAccountState>>().mockRejectedValue(new Error("private gateway detail")),
      eligibility: vi.fn<() => Promise<GenesisEligibility>>().mockRejectedValue(new Error("internal SQL detail")),
    };

    await readGenesisRemoteFacts(api, {
      hasAuthority: () => true,
      isCurrent: () => true,
      clear: vi.fn(),
      clearAccount: vi.fn(),
      applyPublicState: vi.fn(),
      applyAccount: vi.fn(),
      applyEligibility: vi.fn(),
    });

    expect(warn).toHaveBeenCalledWith("GENESIS_PROTECTED_READ_UNAVAILABLE", {
      reason: "GENESIS_ELIGIBILITY_UNAVAILABLE",
      accountAvailable: false,
      eligibilityAvailable: false,
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain("private gateway detail");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("internal SQL detail");
    warn.mockRestore();
  });

  it("keeps public supply facts without issuing protected reads for an anonymous account", async () => {
    const publicState = {} as GenesisPublicState;
    const api = {
      state: vi.fn<() => Promise<GenesisPublicState>>().mockResolvedValue(publicState),
      account: vi.fn(),
      eligibility: vi.fn(),
    };
    const clear = vi.fn();
    const clearAccount = vi.fn();
    const applyPublicState = vi.fn();

    await expect(readGenesisRemoteFacts(api, {
      hasAuthority: () => false,
      isCurrent: () => true,
      clear,
      clearAccount,
      applyPublicState,
      applyAccount: vi.fn(),
      applyEligibility: vi.fn(),
    })).resolves.toBe(true);

    expect(clear).not.toHaveBeenCalled();
    expect(clearAccount).toHaveBeenCalledOnce();
    expect(applyPublicState).toHaveBeenCalledWith(publicState);
    expect(api.state).toHaveBeenCalledOnce();
    expect(api.account).not.toHaveBeenCalled();
    expect(api.eligibility).not.toHaveBeenCalled();
  });

  it("clears all remote facts when anonymous public state is unavailable", async () => {
    const api = {
      state: vi.fn<() => Promise<GenesisPublicState>>().mockRejectedValue(new Error("PUBLIC_STATE_UNAVAILABLE")),
      account: vi.fn(),
      eligibility: vi.fn(),
    };
    const clear = vi.fn();
    const clearAccount = vi.fn();

    await expect(readGenesisRemoteFacts(api, {
      hasAuthority: () => false,
      isCurrent: () => true,
      clear,
      clearAccount,
      applyPublicState: vi.fn(),
      applyAccount: vi.fn(),
      applyEligibility: vi.fn(),
    })).resolves.toBe(false);

    expect(clear).toHaveBeenCalledOnce();
    expect(clearAccount).not.toHaveBeenCalled();
    expect(api.account).not.toHaveBeenCalled();
    expect(api.eligibility).not.toHaveBeenCalled();
  });

  it("drops a response after the account or RunID scope becomes stale", async () => {
    let current = true;
    let resolveAccount!: (value: GenesisAccountState) => void;
    const accountPromise = new Promise<GenesisAccountState>((resolve) => { resolveAccount = resolve; });
    const api = {
      state: vi.fn<() => Promise<GenesisPublicState>>().mockResolvedValue({} as GenesisPublicState),
      account: vi.fn<() => Promise<GenesisAccountState>>().mockReturnValue(accountPromise),
      eligibility: vi.fn<() => Promise<GenesisEligibility>>().mockResolvedValue(eligibility()),
    };
    const applyAccount = vi.fn();
    const applyEligibility = vi.fn();

    const pending = readGenesisRemoteFacts(api, {
      hasAuthority: () => true,
      isCurrent: () => current,
      clear: vi.fn(),
      clearAccount: vi.fn(),
      applyPublicState: vi.fn(),
      applyAccount,
      applyEligibility,
    });
    current = false;
    resolveAccount(account());
    const result = await pending;

    expect(result).toBe(false);
    expect(applyAccount).not.toHaveBeenCalled();
    expect(applyEligibility).not.toHaveBeenCalled();
  });

  it("clears instead of committing when the bearer becomes unauthorized mid-flight", async () => {
    let authorized = true;
    let resolveAccount!: (value: GenesisAccountState) => void;
    const api = {
      state: vi.fn<() => Promise<GenesisPublicState>>().mockResolvedValue({} as GenesisPublicState),
      account: vi.fn<() => Promise<GenesisAccountState>>().mockImplementation(() => new Promise((resolve) => { resolveAccount = resolve; })),
      eligibility: vi.fn<() => Promise<GenesisEligibility>>().mockResolvedValue(eligibility()),
    };
    const clear = vi.fn();
    const applyAccount = vi.fn();

    const pending = readGenesisRemoteFacts(api, {
      hasAuthority: () => authorized,
      isCurrent: () => true,
      clear,
      clearAccount: vi.fn(),
      applyPublicState: vi.fn(),
      applyAccount,
      applyEligibility: vi.fn(),
    });
    authorized = false;
    resolveAccount(account());

    await expect(pending).resolves.toBe(false);
    expect(clear).toHaveBeenCalledOnce();
    expect(applyAccount).not.toHaveBeenCalled();
  });
});
