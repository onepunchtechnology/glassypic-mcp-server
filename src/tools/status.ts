import { DEFAULT_BASE_URL, getAuthHeaders } from "../api/client.js";
import { getAccountStatus } from "../api/auth.js";
import { isX402Configured, getWalletAddress } from "../x402/client.js";

export async function statusTool(): Promise<string> {
  const baseUrl = process.env.GLASSYPIC_API_URL ?? process.env.TINIFY_API_URL ?? DEFAULT_BASE_URL;
  const authHeaders = getAuthHeaders();
  const status = await getAccountStatus(baseUrl, authHeaders);

  const x402Status = isX402Configured()
    ? `Pay As You Go: Enabled (wallet: ${await getWalletAddress()})`
    : "Pay As You Go: Not configured (set TINIFY_X402_PRIVATE_KEY)";

  if (status.logged_in) {
    const resetInfo = status.credits_reset_at
      ? `Resets: ${formatResetTime(status.credits_reset_at)}`
      : "";
    return [
      `Logged in as ${status.email} (${capitalize(status.tier)} tier)`,
      `Credits: ${status.credits_remaining.toLocaleString()} of ${status.credits_limit.toLocaleString()} remaining`,
      resetInfo,
      x402Status,
    ].filter(Boolean).join("\n");
  }

  return [
    "Not logged in. Using guest session.",
    `Credits: ${status.credits_remaining} of ${status.credits_limit} remaining (resets daily)`,
    x402Status,
    "Tip: Log in for more credits \u2014 free accounts get 50/day.",
  ].join("\n");
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
