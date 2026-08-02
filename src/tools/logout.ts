import { SessionManager } from "../session/manager.js";
import { resolveApiBaseUrl } from "../api/client.js";
import { revokeToken } from "../api/auth.js";

export async function logoutTool(): Promise<string> {
  const sessionManager = new SessionManager();
  const { baseUrl } = resolveApiBaseUrl();

  const mcpToken = sessionManager.getMcpToken();
  if (!mcpToken) {
    return "Not logged in. Already using guest session (20 free credits/day).";
  }

  let revokeFailed = false;
  try {
    await revokeToken(baseUrl, mcpToken);
  } catch {
    revokeFailed = true;
  }

  // Unconditional: a user who asks to log out must end up logged out locally,
  // even when the network is unreachable.
  sessionManager.clearMcpToken();

  return revokeFailed
    ? "Logged out locally, but GlassyPic could not be reached to revoke the token server-side — it remains valid until it expires. Running login again issues a new token and revokes this one. Using guest session (20 free credits/day)."
    : "Logged out. Using guest session (20 free credits/day).";
}
