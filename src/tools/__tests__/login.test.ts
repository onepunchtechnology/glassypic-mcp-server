import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  requestDeviceCodeMock,
  pollForTokenMock,
  getAccountStatusMock,
  openBrowserMock,
  getMcpTokenMock,
  saveMcpTokenMock,
  clearMcpTokenMock,
} = vi.hoisted(() => ({
  requestDeviceCodeMock: vi.fn(),
  pollForTokenMock: vi.fn(),
  getAccountStatusMock: vi.fn(),
  openBrowserMock: vi.fn(),
  getMcpTokenMock: vi.fn(),
  saveMcpTokenMock: vi.fn(),
  clearMcpTokenMock: vi.fn(),
}));

vi.mock("../../api/auth.js", () => ({
  requestDeviceCode: requestDeviceCodeMock,
  pollForToken: pollForTokenMock,
  getAccountStatus: getAccountStatusMock,
}));

vi.mock("../../utils/browser.js", () => ({
  openBrowser: openBrowserMock,
}));

vi.mock("../../session/manager.js", () => ({
  SessionManager: vi.fn(() => ({
    getMcpToken: getMcpTokenMock,
    saveMcpToken: saveMcpTokenMock,
    clearMcpToken: clearMcpTokenMock,
  })),
}));

vi.mock("../../api/client.js", () => ({
  DEFAULT_BASE_URL: "https://api.tinify.ai",
}));

import { loginTool } from "../login.js";

const DEVICE_CODE_RESPONSE = {
  device_code: "dc_test",
  user_code: "TINI-ABCD-EFGH",
  verify_url: "https://tinify.ai/mcp/authorize",
};

describe("loginTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    openBrowserMock.mockReturnValue(true);
    requestDeviceCodeMock.mockResolvedValue(DEVICE_CODE_RESPONSE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns current status when already logged in with valid token", async () => {
    getMcpTokenMock.mockReturnValue("mcp_existing");
    getAccountStatusMock.mockResolvedValue({
      logged_in: true,
      email: "user@example.com",
      tier: "pro",
      credits_remaining: 2500,
    });

    const result = await loginTool();

    expect(result).toContain("Already logged in as user@example.com");
    expect(requestDeviceCodeMock).not.toHaveBeenCalled();
  });

  it("clears expired token and starts fresh device flow", async () => {
    getMcpTokenMock.mockReturnValue("mcp_expired");
    getAccountStatusMock.mockResolvedValue({ logged_in: false });
    pollForTokenMock.mockResolvedValue({
      status: "approved",
      mcp_token: "mcp_new",
      user: {
        email: "user@example.com",
        tier: "free",
        credits_remaining: 48,
        credits_limit: 50,
        credits_reset_at: null,
      },
    });

    const resultPromise = loginTool();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(clearMcpTokenMock).toHaveBeenCalledOnce();
    expect(saveMcpTokenMock).toHaveBeenCalledWith("mcp_new", "user@example.com", "free");
    expect(result).toContain("Logged in as user@example.com");
  });

  it("returns success message when poll returns approved", async () => {
    getMcpTokenMock.mockReturnValue(null);
    pollForTokenMock.mockResolvedValue({
      status: "approved",
      mcp_token: "mcp_fresh",
      user: {
        email: "new@example.com",
        tier: "starter",
        credits_remaining: 900,
        credits_limit: 1000,
        credits_reset_at: "2026-06-01T00:00:00Z",
      },
    });

    const resultPromise = loginTool();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toContain("Logged in as new@example.com");
    expect(saveMcpTokenMock).toHaveBeenCalledWith("mcp_fresh", "new@example.com", "starter");
  });

  it("returns denial message when poll returns denied", async () => {
    getMcpTokenMock.mockReturnValue(null);
    pollForTokenMock.mockResolvedValue({ status: "denied" });

    const resultPromise = loginTool();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toContain("denied");
  });

  it("returns timeout message when poll returns expired", async () => {
    getMcpTokenMock.mockReturnValue(null);
    pollForTokenMock.mockResolvedValue({ status: "expired" });

    const resultPromise = loginTool();
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toMatch(/timed out|expired/i);
  });
});
