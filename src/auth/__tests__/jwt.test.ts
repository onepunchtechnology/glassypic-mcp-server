import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => "mock-jwks"),
  jwtVerify: vi.fn(),
}));

describe("verifySupabaseJwt", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.SUPABASE_URL = "https://abc123.supabase.co";
  });

  it("returns null when SUPABASE_URL is not set", async () => {
    delete process.env.SUPABASE_URL;
    const { verifySupabaseJwt } = await import("../jwt.js");
    const result = await verifySupabaseJwt("any.token.here");
    expect(result).toBeNull();
  });

  it("returns null when token is not a Supabase JWT (starts with mcp_)", async () => {
    const { verifySupabaseJwt } = await import("../jwt.js");
    const result = await verifySupabaseJwt("mcp_sometoken");
    expect(result).toBeNull();
  });

  it("returns payload when JWT is valid", async () => {
    const { jwtVerify } = await import("jose");
    vi.mocked(jwtVerify).mockResolvedValueOnce({
      payload: { sub: "user-123", email: "test@example.com" },
    } as any);
    const { verifySupabaseJwt } = await import("../jwt.js");
    const result = await verifySupabaseJwt("eyJvalid.jwt.token");
    expect(result).toEqual({ sub: "user-123", email: "test@example.com" });
  });

  it("returns null when JWT verification fails", async () => {
    const { jwtVerify } = await import("jose");
    vi.mocked(jwtVerify).mockRejectedValueOnce(new Error("invalid signature"));
    const { verifySupabaseJwt } = await import("../jwt.js");
    const result = await verifySupabaseJwt("eyJbad.jwt.token");
    expect(result).toBeNull();
  });
});
