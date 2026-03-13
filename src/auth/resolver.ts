import { verifySupabaseJwt } from "./jwt.js";
import { AnonymousSessionStore } from "./anonymous.js";

// Module-level store — shared across all requests in this process.
const anonStore = new AnonymousSessionStore();

/**
 * Given an Authorization header value and session ID from an HTTP request,
 * returns the auth headers to forward to api.tinify.ai.
 *
 * Priority:
 *   1. Bearer mcp_... → pass through as-is (existing mcp_tokens)
 *   2. Bearer eyJ... → validate Supabase JWT → pass through if valid
 *   3. No/invalid auth → anonymous Supabase session JWT
 */
export async function resolveAuthHeaders(
  authorizationHeader: string | null,
  sessionId: string
): Promise<Record<string, string>> {
  if (authorizationHeader) {
    const token = authorizationHeader.replace(/^Bearer\s+/i, "");

    // mcp_ tokens: forward as-is, no validation needed here
    if (token.startsWith("mcp_")) {
      return { Authorization: `Bearer ${token}` };
    }

    // Supabase JWT: validate, then forward
    if (token.startsWith("eyJ")) {
      const payload = await verifySupabaseJwt(token);
      if (payload) return { Authorization: `Bearer ${token}` };
      // Invalid JWT — fall through to anonymous
    }
  }

  // No auth or invalid JWT — create/reuse anonymous session
  const anonJwt = await anonStore.getOrCreate(sessionId);
  if (!anonJwt) return {};
  return { Authorization: `Bearer ${anonJwt}` };
}
