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
  ) {
    super(message);
    this.name = "ApiError";
  }
}

import { getRequestAuthHeaders } from "../auth/context.js";
import { SessionManager } from "../session/manager.js";

/**
 * Returns auth headers for an API call.
 * In HTTP mode (request context present): uses per-request auth from context.
 * In stdio mode (no context): reads from ~/.tinify/session.json via SessionManager.
 */
export function getAuthHeaders(): Record<string, string> {
  // HTTP mode: context is set by the transport per request
  const contextHeaders = getRequestAuthHeaders();
  if (Object.keys(contextHeaders).length > 0) return contextHeaders;

  // stdio mode: read from local session file
  return new SessionManager().getAuthHeaders();
}
