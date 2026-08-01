import { ApiError } from "./client.js";

export interface ProcessingSettings {
  output_format?: "original" | "jpg" | "png" | "webp" | "avif" | "gif" | "svg" | "ico";
  output_upscale_factor?: 2 | 4;
  output_width?: number;
  output_height?: number;
  output_resize_behavior?: "pad" | "crop";
  output_seo_tag_gen?: boolean;
  output_seo_rename?: boolean;
  output_file_size_limit?: number;
  gif_frame_limit?: number;
}

interface ProcessParams {
  baseUrl: string;
  tempFileIds: string[];
  settings: ProcessingSettings;
  authHeaders: Record<string, string>;
  idempotencyKey?: string;
}

interface JobInfo {
  id: string;
  temp_file_id: string;
  status: string;
  /** Server auto-triggered AI upscale for this job (target > source). */
  auto_upscale?: boolean;
}

export interface ProcessResult {
  success: boolean;
  jobs: JobInfo[];
  credits_used: number;
  credits_remaining: number;
}

export async function triggerProcessing(params: ProcessParams): Promise<ProcessResult> {
  const { baseUrl, tempFileIds, settings, authHeaders, idempotencyKey } = params;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders,
  };
  if (idempotencyKey) {
    headers["X-Slack-Idempotency-Key"] = idempotencyKey;
  }

  const response = await fetch(`${baseUrl}/auto`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      temp_file_ids: tempFileIds,
      settings,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));

    // The backend can still return 402; this client no longer pays it.
    if (response.status === 402) {
      throw new ApiError(
        "Insufficient credits for this operation.\n\n" +
          "Use the `login` tool to sign in for more credits (free = 30/day, Pro = 3,300/month), " +
          "or the `upgrade` tool to view plans.",
        402,
        body.detail,
        body,
      );
    }

    if (response.status === 429) {
      if (body.is_guest) {
        throw new ApiError(
          `You've used all ${body.credits_limit || 20} free daily credits. ` +
          `Log in for more credits (free = 30/day, Pro = 3,300/month). ` +
          `Use the login tool to sign in, or wait until credits reset.`,
          429,
          body.detail,
          body,
        );
      } else if (body.tier) {
        throw new ApiError(
          `You've used all ${body.credits_limit} credits for this period (${body.tier} tier). ` +
          `Upgrade for more credits, or wait until they reset.`,
          429,
          body.detail,
          body,
        );
      } else {
        // Fallback for old backend format
        const remaining = response.headers.get("X-RateLimit-Remaining") ?? "0";
        throw new ApiError(
          `Insufficient credits. ${remaining} credits remaining.`,
          429,
          body.detail,
          body,
        );
      }
    }
    throw new ApiError(body.detail || "Processing failed", response.status, body.detail, body);
  }

  return response.json();
}
