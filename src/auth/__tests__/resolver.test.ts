import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../jwt.js", () => ({
  verifySupabaseJwt: vi.fn(),
}));
vi.mock("../anonymous.js", () => ({
  AnonymousSessionStore: vi.fn(() => ({
    getOrCreate: vi.fn().mockResolvedValue("eyJanon.jwt"),
  })),
}));

describe("resolveAuthHeaders", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("passes through valid Supabase JWT as Bearer token", async () => {
    const { verifySupabaseJwt } = await import("../jwt.js");
    vi.mocked(verifySupabaseJwt).mockResolvedValueOnce({ sub: "user-1" } as any);
    const { resolveAuthHeaders } = await import("../resolver.js");
    const result = await resolveAuthHeaders("Bearer eyJvalid.jwt", "session-1");
    expect(result).toEqual({ Authorization: "Bearer eyJvalid.jwt" });
  });

  it("returns empty headers when Supabase JWT is invalid", async () => {
    const { verifySupabaseJwt } = await import("../jwt.js");
    vi.mocked(verifySupabaseJwt).mockResolvedValueOnce(null);
    const { resolveAuthHeaders } = await import("../resolver.js");
    const result = await resolveAuthHeaders("Bearer eyJbad.jwt", "session-1");
    // Falls through to anonymous
    expect(result).toEqual({ Authorization: "Bearer eyJanon.jwt" });
  });

  it("passes through mcp_ token without validation", async () => {
    const { resolveAuthHeaders } = await import("../resolver.js");
    const result = await resolveAuthHeaders("Bearer mcp_abc123", "session-1");
    expect(result).toEqual({ Authorization: "Bearer mcp_abc123" });
  });

  it("creates anonymous session when no Authorization header", async () => {
    const { resolveAuthHeaders } = await import("../resolver.js");
    const result = await resolveAuthHeaders(null, "session-new");
    expect(result).toEqual({ Authorization: "Bearer eyJanon.jwt" });
  });

  it("returns empty headers when anonymous session creation fails", async () => {
    const { AnonymousSessionStore } = await import("../anonymous.js");
    vi.mocked(AnonymousSessionStore).mockImplementationOnce(() => ({
      getOrCreate: vi.fn().mockResolvedValue(null),
    }) as any);
    const { resolveAuthHeaders } = await import("../resolver.js");
    const result = await resolveAuthHeaders(null, "session-fail");
    expect(result).toEqual({});
  });
});
