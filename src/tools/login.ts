import { SessionManager } from "../session/manager.js";
import { DEFAULT_BASE_URL } from "../api/client.js";
import { requestDeviceCode, pollForToken, getAccountStatus } from "../api/auth.js";
import { openBrowser } from "../utils/browser.js";

const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

export async function loginTool(): Promise<string> {
  const sessionManager = new SessionManager();
  const baseUrl = process.env.GLASSYPIC_API_URL ?? process.env.TINIFY_API_URL ?? DEFAULT_BASE_URL;

  // If already logged in, return current status
  const existingToken = sessionManager.getMcpToken();
  if (existingToken) {
    const status = await getAccountStatus(baseUrl, { Authorization: `Bearer ${existingToken}` });
    if (status.logged_in) {
      return `Already logged in as ${status.email} (${status.tier} tier, ${status.credits_remaining.toLocaleString()} credits remaining).`;
    }
    // Token expired, clear it
    sessionManager.clearMcpToken();
  }

  // Request device code
  const { device_code, user_code, verify_url } = await requestDeviceCode(baseUrl);
  const authorizeUrl = `${verify_url}?code=${user_code}`;

  // Open browser
  const opened = openBrowser(authorizeUrl);
  const browserMsg = opened
    ? `Opening browser... Complete login at glassypic.com.`
    : `Open this URL to log in: ${authorizeUrl}`;

  // Poll for approval
  const startTime = Date.now();
  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const result = await pollForToken(baseUrl, device_code);

    if (result.status === "approved" && result.mcp_token && result.user) {
      sessionManager.saveMcpToken(result.mcp_token, result.user.email, result.user.tier);
      const resetInfo = result.user.credits_reset_at
        ? ` until ${formatResetTime(result.user.credits_reset_at)}`
        : "";
      return `Logged in as ${result.user.email} (${capitalize(result.user.tier)} tier, ${result.user.credits_remaining.toLocaleString()} of ${result.user.credits_limit.toLocaleString()} credits remaining${resetInfo})`;
    }

    if (result.status === "denied") {
      return "Authorization denied.";
    }

    if (result.status === "expired") {
      return "Login timed out. Try again.";
    }
  }

  return "Login timed out after 5 minutes. Try again.";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatResetTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}
