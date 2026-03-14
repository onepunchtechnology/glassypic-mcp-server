import { ApiError } from "./client.js";
import { getX402Fetch, isX402Configured, getWalletAddress } from "../x402/client.js";

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
}

interface JobInfo {
  id: string;
  temp_file_id: string;
  status: string;
}

export interface ProcessResult {
  success: boolean;
  jobs: JobInfo[];
  credits_used: number;
  credits_remaining: number;
}

export async function triggerProcessing(params: ProcessParams): Promise<ProcessResult> {
  const { baseUrl, tempFileIds, settings, authHeaders } = params;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders,
  };

  // Use x402-wrapped fetch if available (auto-handles 402 payment signing)
  const x402Fetch = await getX402Fetch();
  const fetchFn = x402Fetch ?? fetch;

  const response = await fetchFn(`${baseUrl}/auto`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      temp_file_ids: tempFileIds,
      settings,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));

    // Handle 402 Payment Required (x402 not configured or payment failed)
    if (response.status === 402) {
      const priceUsdc = body.x402?.price_usdc ?? "unknown";
      const creditsNeeded = body.x402?.credits_needed ?? "unknown";

      if (!isX402Configured()) {
        throw new ApiError(
          `Insufficient credits. This operation costs $${priceUsdc} USDC (${creditsNeeded} credits).\n\n` +
          `To enable Pay As You Go:\n` +
          `1. Set TINIFY_X402_PRIVATE_KEY environment variable with a Base wallet private key\n` +
          `2. Fund the wallet with USDC on Base network\n\n` +
          `Or use \`login\` to access subscription credits.`,
          402,
          body.detail,
        );
      }

      // x402 IS configured but payment still failed
      const walletAddr = await getWalletAddress();
      throw new ApiError(
        `Payment failed for $${priceUsdc} USDC. Check your wallet has sufficient USDC on Base.\n` +
        `Wallet: ${walletAddr}`,
        402,
        body.detail,
      );
    }

    if (response.status === 429) {
      if (body.is_guest) {
        throw new ApiError(
          `You've used all ${body.credits_limit || 20} free daily credits. ` +
          `Log in for more credits (free = 50/day, Pro = 3,000/month). ` +
          `Use the login tool to sign in, or wait until credits reset.`,
          429,
          body.detail,
        );
      } else if (body.tier) {
        throw new ApiError(
          `You've used all ${body.credits_limit} credits for this period (${body.tier} tier). ` +
          `Upgrade for more credits, or wait until they reset.`,
          429,
          body.detail,
        );
      } else {
        // Fallback for old backend format
        const remaining = response.headers.get("X-RateLimit-Remaining") ?? "0";
        throw new ApiError(
          `Insufficient credits. ${remaining} credits remaining.`,
          429,
          body.detail,
        );
      }
    }
    throw new ApiError(body.detail || "Processing failed", response.status, body.detail);
  }

  return response.json();
}
