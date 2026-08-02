import { SessionManager } from "../session/manager.js";
import { resolveApiBaseUrl } from "../api/client.js";
import { revokeToken } from "../api/auth.js";

export async function logoutTool(): Promise<string> {
  const sessionManager = new SessionManager();

  const mcpToken = sessionManager.getMcpToken();
  if (!mcpToken) {
    return "Not logged in. Already using guest session (20 free credits/day).";
  }

  // Configuration must never block a local clear — resolve the base URL only
  // here, where revocation actually needs it, and treat a resolution failure
  // (e.g. a malformed GLASSYPIC_API_URL) the same as a revocation failure: the
  // user still ends up logged out locally, even when the network is
  // unreachable or misconfigured.
  let revokeFailed = false;
  try {
    const { baseUrl } = resolveApiBaseUrl();
    await revokeToken(baseUrl, mcpToken);
  } catch {
    revokeFailed = true;
  }

  // Unconditional: a user who asks to log out must end up logged out locally,
  // even when the network is unreachable or GLASSYPIC_API_URL is invalid.
  sessionManager.clearMcpToken();

  return revokeFailed
    ? "Logged out locally, but GlassyPic could not be reached to revoke the token server-side — it remains valid until it expires. Running login again issues a new token and revokes this one. Using guest session (20 free credits/day)."
    : "Logged out. Using guest session (20 free credits/day).";
}
