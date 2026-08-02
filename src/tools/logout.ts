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

  try {
    await revokeToken(baseUrl, mcpToken);
  } catch {
    // Best-effort revocation — clear locally regardless
  }

  sessionManager.clearMcpToken();
  return "Logged out. Using guest session (20 free credits/day).";
}
