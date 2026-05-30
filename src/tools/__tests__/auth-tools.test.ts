import { describe, it, expect, vi, beforeEach } from "vitest";

const getMcpTokenMock = vi.hoisted(() => vi.fn());
const clearMcpTokenMock = vi.hoisted(() => vi.fn());
const getAccountStatusMock = vi.hoisted(() => vi.fn());
const revokeTokenMock = vi.hoisted(() => vi.fn());
const getAuthHeadersMock = vi.hoisted(() => vi.fn());
const isX402ConfiguredMock = vi.hoisted(() => vi.fn());
const getWalletAddressMock = vi.hoisted(() => vi.fn());

vi.mock("../../session/manager.js", () => ({
  SessionManager: vi.fn(() => ({
    getMcpToken: getMcpTokenMock,
    clearMcpToken: clearMcpTokenMock,
  })),
}));

vi.mock("../../api/auth.js", () => ({
  revokeToken: revokeTokenMock,
  getAccountStatus: getAccountStatusMock,
}));

vi.mock("../../api/client.js", () => ({
  DEFAULT_BASE_URL: "https://api.tinify.ai",
  getAuthHeaders: getAuthHeadersMock,
}));

vi.mock("../../x402/client.js", () => ({
  isX402Configured: isX402ConfiguredMock,
  getWalletAddress: getWalletAddressMock,
}));

import { logoutTool } from "../logout.js";
import { statusTool } from "../status.js";

describe("logoutTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isX402ConfiguredMock.mockReturnValue(false);
    getAuthHeadersMock.mockReturnValue({});
  });

  it("revokes and clears token when logged in", async () => {
    getMcpTokenMock.mockReturnValue("mcp_active");
    revokeTokenMock.mockResolvedValue(undefined);

    const result = await logoutTool();

    expect(revokeTokenMock).toHaveBeenCalledWith(expect.any(String), "mcp_active");
    expect(clearMcpTokenMock).toHaveBeenCalledOnce();
    expect(result).toMatch(/logged out/i);
  });

  it("returns 'not logged in' message when no token", async () => {
    getMcpTokenMock.mockReturnValue(null);

    const result = await logoutTool();

    expect(revokeTokenMock).not.toHaveBeenCalled();
    expect(result).toMatch(/not logged in/i);
  });

  it("still clears token locally when revokeToken throws", async () => {
    getMcpTokenMock.mockReturnValue("mcp_active");
    revokeTokenMock.mockRejectedValue(new Error("network error"));

    const result = await logoutTool();

    expect(clearMcpTokenMock).toHaveBeenCalledOnce();
    expect(result).toMatch(/logged out/i);
  });
});

describe("statusTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isX402ConfiguredMock.mockReturnValue(false);
    getAuthHeadersMock.mockReturnValue({});
  });

  it("returns tier and credits when logged in", async () => {
    getAccountStatusMock.mockResolvedValue({
      logged_in: true,
      email: "user@example.com",
      tier: "pro",
      credits_remaining: 2500,
      credits_limit: 3000,
      credits_reset_at: null,
    });

    const result = await statusTool();

    expect(result).toContain("user@example.com");
    expect(result).toContain("Pro");
    expect(result).toContain("2,500");
  });

  it("returns 'not logged in' message when not logged in", async () => {
    getAccountStatusMock.mockResolvedValue({
      logged_in: false,
      credits_remaining: 20,
      credits_limit: 20,
    });

    const result = await statusTool();

    expect(result).toMatch(/not logged in/i);
    expect(result).toContain("20");
  });

  it("includes x402 wallet info when configured", async () => {
    isX402ConfiguredMock.mockReturnValue(true);
    getWalletAddressMock.mockResolvedValue("0xABCD1234");
    getAccountStatusMock.mockResolvedValue({
      logged_in: false,
      credits_remaining: 20,
      credits_limit: 20,
    });

    const result = await statusTool();

    expect(result).toContain("Enabled");
    expect(result).toContain("0xABCD1234");
  });

  it("shows x402 not configured message when not set", async () => {
    isX402ConfiguredMock.mockReturnValue(false);
    getAccountStatusMock.mockResolvedValue({
      logged_in: false,
      credits_remaining: 20,
      credits_limit: 20,
    });

    const result = await statusTool();

    expect(result).toContain("Not configured");
  });

  it("includes reset time when credits_reset_at is set", async () => {
    getAccountStatusMock.mockResolvedValue({
      logged_in: true,
      email: "user@example.com",
      tier: "free",
      credits_remaining: 40,
      credits_limit: 50,
      credits_reset_at: "2026-06-01T00:00:00Z",
    });

    const result = await statusTool();

    expect(result).toContain("Resets");
  });
});
