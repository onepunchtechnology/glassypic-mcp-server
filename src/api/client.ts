import { getRequestAuthHeaders } from "../auth/context.js";
import { SessionManager } from "../session/manager.js";

export interface ClientConfig {
  baseUrl: string;
  sessionToken: string | null;
}

export const DEFAULT_BASE_URL = "https://api.glassypic.com";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly detail?: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Returns auth headers for an API call.
 * In HTTP mode (request context present): uses per-request auth from context.
 * In stdio mode (no context): reads from ~/.glassypic/session.json via SessionManager
 * (falls back to the legacy ~/.tinify path for pre-rename logins).
 */
export function getAuthHeaders(): Record<string, string> {
  // HTTP mode: context is set by the transport per request
  const contextHeaders = getRequestAuthHeaders();
  if (Object.keys(contextHeaders).length > 0) return contextHeaders;

  // stdio mode: read from local session file
  return new SessionManager().getAuthHeaders();
}

export function buildAuthHeaders(token?: string): Record<string, string> {
  if (token !== undefined) {
    const normalizedToken = token.trim();
    if (normalizedToken.length === 0) {
      throw new ApiError("Explicit auth token must not be blank.", 400);
    }
    return { "X-Session-Token": normalizedToken };
  }
  return getAuthHeaders();
}
