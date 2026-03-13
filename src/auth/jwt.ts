import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks(): ReturnType<typeof createRemoteJWKSet> | null {
  if (!process.env.SUPABASE_URL) return null;
  if (!_jwks) {
    _jwks = createRemoteJWKSet(
      new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)
    );
  }
  return _jwks;
}

/**
 * Validates a Supabase-issued JWT using JWKS.
 * Returns the payload if valid, null if invalid or not a Supabase JWT.
 */
export async function verifySupabaseJwt(token: string): Promise<JWTPayload | null> {
  if (!process.env.SUPABASE_URL) return null;
  // mcp_ tokens are not JWTs; skip JWKS validation
  if (!token.startsWith("eyJ")) return null;

  const jwks = getJwks();
  if (!jwks) return null;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `${process.env.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });
    return payload;
  } catch {
    return null;
  }
}
