import { describe, it, expect, vi, beforeEach } from "vitest";
import { requestDeviceCode, pollForToken, revokeToken, getAccountStatus } from "../auth.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const BASE_URL = "https://api.tinify.ai";

describe("requestDeviceCode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs to /mcp/auth/device-code", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ device_code: "dc_abc", user_code: "TINI-7X4K-M2P9", verify_url: "https://tinify.ai/mcp/authorize" }),
    });
    const result = await requestDeviceCode(BASE_URL);
    expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}/mcp/auth/device-code`, { method: "POST" });
    expect(result.device_code).toBe("dc_abc");
    expect(result.user_code).toBe("TINI-7X4K-M2P9");
  });
});

describe("pollForToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GETs /mcp/auth/token with device_code", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: "pending" }),
    });
    const result = await pollForToken(BASE_URL, "dc_abc");
    expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}/mcp/auth/token?device_code=dc_abc`);
    expect(result.status).toBe("pending");
  });

  it("returns approved with mcp_token and user", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "approved",
        mcp_token: "mcp_xyz",
        user: { email: "a@b.com", tier: "pro", credits_remaining: 2850, credits_limit: 3000, credits_reset_at: "2026-02-28T23:59:00-08:00" },
      }),
    });
    const result = await pollForToken(BASE_URL, "dc_abc");
    expect(result.status).toBe("approved");
    expect(result.mcp_token).toBe("mcp_xyz");
    expect(result.user!.email).toBe("a@b.com");
  });
});

describe("revokeToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs to /mcp/auth/revoke with Bearer header", async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    await revokeToken(BASE_URL, "mcp_xyz");
    expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}/mcp/auth/revoke`, {
      method: "POST",
      headers: { Authorization: "Bearer mcp_xyz" },
    });
  });
});

describe("getAccountStatus", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends mcp_token as Bearer when available", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ logged_in: true, email: "a@b.com", tier: "pro", credits_remaining: 2850, credits_limit: 3000, credits_reset_at: null }),
    });
    await getAccountStatus(BASE_URL, { Authorization: "Bearer mcp_xyz" });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers.Authorization).toBe("Bearer mcp_xyz");
  });

  it("sends session_token as X-Session-Token when no mcp_token", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ logged_in: false, tier: "unregistered", credits_remaining: 12, credits_limit: 20, credits_reset_at: null }),
    });
    await getAccountStatus(BASE_URL, { "X-Session-Token": "guest_abc" });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers["X-Session-Token"]).toBe("guest_abc");
  });
});
