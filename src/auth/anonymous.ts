import { createClient } from "@supabase/supabase-js";

interface CachedSession {
  jwt: string;
  expiresAt: number; // Unix ms
}

const MAX_CACHE_SIZE = 10_000;

/**
 * Manages anonymous Supabase sessions for unauthenticated MCP clients.
 * Each unique Mcp-Session-Id gets its own anonymous Supabase user.
 * JWTs are cached in memory with bounded LRU eviction and TTL.
 */
export class AnonymousSessionStore {
  private readonly cache = new Map<string, CachedSession>(); // sessionId → { jwt, expiresAt }

  async getOrCreate(sessionId: string): Promise<string | null> {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return null;

    const cached = this.cache.get(sessionId);
    if (cached && cached.expiresAt > Date.now()) {
      // LRU: delete and re-insert to move to end
      this.cache.delete(sessionId);
      this.cache.set(sessionId, cached);
      return cached.jwt;
    }

    // Fresh client per call to avoid race conditions between concurrent requests
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.session) return null;

    const jwt = data.session.access_token;
    const expiresAt = Date.now() + (data.session.expires_in ?? 3600) * 1000;

    // Evict oldest entry if at capacity (LRU — Map preserves insertion order)
    if (this.cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }

    this.cache.set(sessionId, { jwt, expiresAt });
    return jwt;
  }
}
