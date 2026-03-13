import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSignIn = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: { signInAnonymously: mockSignIn },
  })),
}));

describe("AnonymousSessionStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://abc123.supabase.co";
    process.env.SUPABASE_ANON_KEY = "test-anon-key";
  });

  it("returns null when SUPABASE_URL is not configured", async () => {
    delete process.env.SUPABASE_URL;
    const { AnonymousSessionStore } = await import("../anonymous.js");
    const store = new AnonymousSessionStore();
    const result = await store.getOrCreate("session-1");
    expect(result).toBeNull();
  });

  it("creates a new anonymous user and returns JWT for new session", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: { session: { access_token: "eyJanon.jwt.token" } },
      error: null,
    });
    const { AnonymousSessionStore } = await import("../anonymous.js");
    const store = new AnonymousSessionStore();
    const result = await store.getOrCreate("session-abc");
    expect(result).toBe("eyJanon.jwt.token");
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it("reuses cached JWT for the same session ID", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: { session: { access_token: "eyJanon.jwt.token" } },
      error: null,
    });
    const { AnonymousSessionStore } = await import("../anonymous.js");
    const store = new AnonymousSessionStore();
    await store.getOrCreate("session-abc");
    await store.getOrCreate("session-abc");
    expect(mockSignIn).toHaveBeenCalledTimes(1); // not called again
  });

  it("creates separate users for different session IDs", async () => {
    mockSignIn
      .mockResolvedValueOnce({ data: { session: { access_token: "eyJtoken1" } }, error: null })
      .mockResolvedValueOnce({ data: { session: { access_token: "eyJtoken2" } }, error: null });
    const { AnonymousSessionStore } = await import("../anonymous.js");
    const store = new AnonymousSessionStore();
    const t1 = await store.getOrCreate("session-1");
    const t2 = await store.getOrCreate("session-2");
    expect(t1).toBe("eyJtoken1");
    expect(t2).toBe("eyJtoken2");
  });

  it("returns null when Supabase sign-in fails", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "service unavailable" },
    });
    const { AnonymousSessionStore } = await import("../anonymous.js");
    const store = new AnonymousSessionStore();
    const result = await store.getOrCreate("session-fail");
    expect(result).toBeNull();
  });

  it("re-creates session when cached JWT is expired", async () => {
    mockSignIn
      .mockResolvedValueOnce({
        data: { session: { access_token: "eyJexpired", expires_in: 0 } },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { session: { access_token: "eyJfresh", expires_in: 3600 } },
        error: null,
      });
    const { AnonymousSessionStore } = await import("../anonymous.js");
    const store = new AnonymousSessionStore();
    await store.getOrCreate("session-ttl");
    // Wait a tick so the 0-second TTL expires
    await new Promise(r => setTimeout(r, 10));
    const result = await store.getOrCreate("session-ttl");
    expect(result).toBe("eyJfresh");
    expect(mockSignIn).toHaveBeenCalledTimes(2);
  });
});
