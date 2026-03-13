import * as fs from "node:fs";
import * as path from "node:path";
import { uploadFile } from "../api/upload.js";
import { triggerProcessing, type ProcessingSettings } from "../api/process.js";
import { waitForCompletion } from "../api/status.js";
import { downloadFile } from "../api/download.js";
import { resolveInput } from "../utils/input.js";
import { resolveUniqueOutputPath } from "../utils/output.js";
import { DEFAULT_BASE_URL, getAuthHeaders } from "../api/client.js";
import { SessionManager } from "../session/manager.js";

export interface OptimizeImageParams {
  input: string;
  output_path?: string;
  output_format?: "original" | "jpg" | "png" | "webp" | "avif" | "gif";
  output_width_px?: number;
  output_height_px?: number;
  output_upscale_factor?: number;
  output_resize_behavior?: "pad" | "crop";
  output_seo_tag_gen?: boolean;
  confirm_gif_cost?: boolean;
  gif_frame_limit?: number;
  _gif_temp_file_id?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface OptimizeImageResult {
  [key: string]: unknown;
  output_path: string;
  output_size_bytes: number;
  output_width_px: number | null;
  output_height_px: number | null;
  output_format: string | null;
  compression_ratio: number | null;
  seo_alt_text: string | null;
  seo_keywords: string[] | null;
  seo_filename: string | null;
}

export async function optimizeImage(
  params: OptimizeImageParams,
): Promise<OptimizeImageResult> {
  const baseUrl = params.baseUrl ?? DEFAULT_BASE_URL;

  // 1. Resolve input (read file or fetch URL)
  const input = await resolveInput(params.input);

  // 2. Upload to backend (skip if reusing from GIF cost warning)
  const authHeaders = getAuthHeaders();
  let uploadResult: Awaited<ReturnType<typeof uploadFile>>;

  if (params._gif_temp_file_id && params.confirm_gif_cost) {
    // Reuse the upload from a previous GIF cost warning — no re-upload needed
    uploadResult = {
      temp_file_id: params._gif_temp_file_id,
      original_filename: input.filename,
      file_size: input.buffer.length,
      mime_type: "image/gif",
      session_token: null,
    };
  } else {
    uploadResult = await uploadFile({
      baseUrl,
      fileBuffer: input.buffer,
      filename: input.filename,
      authHeaders,
    });

    // Persist new session token if returned (for guest sessions, stdio mode only)
    if (uploadResult.session_token && process.env.MCP_TRANSPORT !== "http") {
      new SessionManager().saveToken(uploadResult.session_token);
    }
  }

  // Check if animated GIF needs cost confirmation
  const isAnimatedGif = uploadResult.gif_frame_count && uploadResult.gif_frame_count > 1;
  if (isAnimatedGif && !params.confirm_gif_cost) {
    const frameLimit = params.gif_frame_limit ?? 100;
    const framesToProcess = Math.min(uploadResult.gif_frame_count!, frameLimit);
    let perFrameCost = 3; // compress always runs
    if (params.output_width_px || params.output_height_px) perFrameCost += 1;
    if (params.output_upscale_factor) perFrameCost += 2;
    const tagCost = params.output_seo_tag_gen !== false ? 1 : 0;
    const totalCost = framesToProcess * perFrameCost + tagCost;

    const warning = [
      `Animated GIF detected: ${input.filename}`,
      `  ${uploadResult.gif_frame_count} frames, ${uploadResult.gif_fps ?? "?"} fps`,
      `  ${framesToProcess} frames × ${perFrameCost} credits = ${totalCost} credits`,
      ``,
      `  Animated GIFs are processed frame-by-frame for highest quality.`,
      `  To proceed, call optimize_image again with:`,
      `    confirm_gif_cost: true`,
      `    _gif_temp_file_id: "${uploadResult.temp_file_id}"`,
      `  To reduce cost, set gif_frame_limit (1-100, default 100).`,
    ].join("\n");

    return {
      output_path: "",
      output_size_bytes: 0,
      output_width_px: null,
      output_height_px: null,
      output_format: null,
      compression_ratio: null,
      seo_alt_text: null,
      seo_keywords: null,
      seo_filename: null,
      _gif_warning: warning,
      _gif_temp_file_id: uploadResult.temp_file_id,
    };
  }

  // 3. Build settings (smart defaults: compress always, SEO tags on)
  const settings: ProcessingSettings = {
    output_format: params.output_format ?? "original",
    output_seo_tag_gen: params.output_seo_tag_gen ?? true,
    output_seo_rename: false,
  };
  if (params.output_width_px !== undefined) {
    settings.output_width = params.output_width_px;
  }
  if (params.output_height_px !== undefined) {
    settings.output_height = params.output_height_px;
  }
  if (params.output_upscale_factor !== undefined) {
    settings.output_upscale_factor = params.output_upscale_factor;
  }
  // When dimensions are set, pass resize_behavior (pad default, crop opt-in)
  if (params.output_width_px !== undefined || params.output_height_px !== undefined) {
    settings.output_resize_behavior = params.output_resize_behavior ?? "pad";
  }
  if (params.gif_frame_limit !== undefined) {
    settings.gif_frame_limit = params.gif_frame_limit;
  }

  // 4. Trigger processing
  const processResult = await triggerProcessing({
    baseUrl,
    tempFileIds: [uploadResult.temp_file_id],
    settings,
    authHeaders,
  });

  const job = processResult.jobs[0];
  if (!job?.id) {
    throw new Error("No job created by the server.");
  }

  // 5. Wait for completion via SSE
  const completedJob = await waitForCompletion({
    baseUrl,
    jobId: job.id,
    timeoutMs: params.timeoutMs ?? 60000,
  });

  // 6. Download processed file
  const downloadResult = await downloadFile({ baseUrl, jobId: job.id });

  // 7. Resolve output path and save
  const outputPath = resolveUniqueOutputPath({
    inputPath: params.input,
    isUrl: input.isUrl,
    filename: input.filename,
    outputPath: params.output_path,
    outputFormat:
      params.output_format && params.output_format !== "original"
        ? params.output_format
        : completedJob.processed_format ?? undefined,
    seoFilename:
      params.output_seo_tag_gen !== false
        ? (completedJob.seo_filename ?? undefined)
        : undefined,
  });

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, downloadResult.buffer);

  return {
    output_path: outputPath,
    output_size_bytes: completedJob.processed_size ?? downloadResult.buffer.length,
    output_width_px: completedJob.processed_width ?? null,
    output_height_px: completedJob.processed_height ?? null,
    output_format: completedJob.processed_format ?? null,
    compression_ratio: completedJob.processed_compression_ratio ?? null,
    seo_alt_text: completedJob.seo_alt_text ?? null,
    seo_keywords: completedJob.seo_keywords ?? null,
    seo_filename: completedJob.seo_filename ?? null,
  };
}
