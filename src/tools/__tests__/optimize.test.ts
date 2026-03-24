import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock all API modules before importing optimize
vi.mock("../../api/upload.js", () => ({
  uploadFile: vi.fn(),
  uploadUrl: vi.fn(),
}));
vi.mock("../../api/process.js", () => ({
  triggerProcessing: vi.fn(),
}));
vi.mock("../../api/status.js", () => ({
  waitForCompletion: vi.fn(),
}));
vi.mock("../../api/download.js", () => ({
  downloadFile: vi.fn(),
}));
vi.mock("../../session/manager.js", () => ({
  SessionManager: vi.fn(),
}));

import { optimizeImage } from "../optimize.js";
import { uploadFile, uploadUrl } from "../../api/upload.js";
import { triggerProcessing } from "../../api/process.js";
import { waitForCompletion } from "../../api/status.js";
import { downloadFile } from "../../api/download.js";
import { SessionManager } from "../../session/manager.js";

describe("optimizeImage", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(SessionManager).mockImplementation(() => ({
      sessionDir: "/tmp/.tinify",
      getAuthHeaders: vi.fn().mockReturnValue({}),
      saveToken: vi.fn(),
    }) as any);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinify-optimize-test-"));

    // Create a test input file
    fs.writeFileSync(path.join(tmpDir, "hero.png"), "fake-png");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("orchestrates the full optimize flow", async () => {
    vi.mocked(uploadFile).mockResolvedValueOnce({
      temp_file_id: "temp-1",
      original_filename: "hero.png",
      file_size: 50000,
      mime_type: "image/png",
      session_token: "new-session",
    });

    vi.mocked(triggerProcessing).mockResolvedValueOnce({
      success: true,
      jobs: [{ id: "job-1", temp_file_id: "temp-1", status: "queued" }],
      credits_used: 4,
      credits_remaining: 16,
    });

    vi.mocked(waitForCompletion).mockResolvedValueOnce({
      job_id: "job-1",
      status: "completed",
      processed_size: 30000,
      processed_format: "png",
      processed_width: 800,
      processed_height: 600,
      processed_compression_ratio: 0.6,
      seo_alt_text: "A hero image",
      seo_filename: "hero-image",
      seo_keywords: ["hero", "image"],
    });

    vi.mocked(downloadFile).mockResolvedValueOnce({
      buffer: Buffer.from("optimized-png"),
      filename: "hero.tinified.png",
    });

    const result = await optimizeImage({
      input: path.join(tmpDir, "hero.png"),
      baseUrl: "https://api.tinify.ai",
    });

    expect(result.output_path).toContain("hero-image.png");
    expect(result.output_size_bytes).toBe(30000);
    expect(result.output_width_px).toBe(800);
    expect(result.output_height_px).toBe(600);
    expect(result.output_format).toBe("png");
    expect(result.compression_ratio).toBe(0.6);
    expect(result.seo_alt_text).toBe("A hero image");
    expect(result.seo_keywords).toEqual(["hero", "image"]);

    // Verify file was written
    expect(fs.existsSync(result.output_path)).toBe(true);
    expect(fs.readFileSync(result.output_path, "utf-8")).toBe("optimized-png");
  });

  it("passes settings through to processing", async () => {
    vi.mocked(uploadFile).mockResolvedValueOnce({
      temp_file_id: "temp-1",
      original_filename: "hero.png",
      file_size: 50000,
      mime_type: "image/png",
      session_token: null,
    });
    vi.mocked(triggerProcessing).mockResolvedValueOnce({
      success: true,
      jobs: [{ id: "job-1", temp_file_id: "temp-1", status: "queued" }],
      credits_used: 7,
      credits_remaining: 13,
    });
    vi.mocked(waitForCompletion).mockResolvedValueOnce({
      job_id: "job-1",
      status: "completed",
      processed_size: 20000,
      processed_format: "webp",
      processed_width: 1920,
      processed_height: 1080,
      processed_compression_ratio: 0.4,
    });
    vi.mocked(downloadFile).mockResolvedValueOnce({
      buffer: Buffer.from("webp-data"),
      filename: "hero.tinified.webp",
    });

    await optimizeImage({
      input: path.join(tmpDir, "hero.png"),
      baseUrl: "https://api.tinify.ai",
      output_format: "webp",
      output_width_px: 1920,
      output_height_px: 1080,
      output_seo_tag_gen: false,
    });

    const processCall = vi.mocked(triggerProcessing).mock.calls[0][0];
    expect(processCall.settings.output_format).toBe("webp");
    expect(processCall.settings.output_width).toBe(1920);
    expect(processCall.settings.output_height).toBe(1080);
    expect(processCall.settings.output_seo_tag_gen).toBe(false);
  });

  describe("URL input", () => {
    it("uses uploadUrl for URL inputs instead of uploadFile", async () => {
      vi.mocked(uploadUrl).mockResolvedValueOnce({
        temp_file_id: "temp-url",
        original_filename: "photo.jpg",
        file_size: 14000,
        mime_type: "image/jpeg",
        session_token: null,
      });
      vi.mocked(triggerProcessing).mockResolvedValueOnce({
        success: true,
        jobs: [{ id: "job-1", temp_file_id: "temp-url", status: "queued" }],
        credits_used: 4,
        credits_remaining: 16,
      });
      vi.mocked(waitForCompletion).mockResolvedValueOnce({
        job_id: "job-1",
        status: "completed",
        processed_size: 10000,
        processed_format: "jpg",
        processed_width: 400,
        processed_height: 300,
        processed_compression_ratio: 0.7,
      });
      vi.mocked(downloadFile).mockResolvedValueOnce({
        buffer: Buffer.from("optimized-jpg"),
        filename: "photo.tinified.jpg",
      });

      const result = await optimizeImage({
        input: "https://cdn.example.com/photo.jpg",
        baseUrl: "https://api.tinify.ai",
        output_path: tmpDir + "/",
      });

      expect(vi.mocked(uploadUrl)).toHaveBeenCalledWith(
        expect.objectContaining({ url: "https://cdn.example.com/photo.jpg", filename: "photo.jpg" }),
      );
      expect(vi.mocked(uploadFile)).not.toHaveBeenCalled();
      expect(result.output_path).toContain("photo");
    });
  });

  it("throws when server returns an empty jobs array (no job created)", async () => {
    vi.mocked(uploadFile).mockResolvedValueOnce({
      temp_file_id: "temp-1",
      original_filename: "hero.png",
      file_size: 50000,
      mime_type: "image/png",
      session_token: null,
    });
    vi.mocked(triggerProcessing).mockResolvedValueOnce({
      success: true,
      jobs: [],
      credits_used: 0,
      credits_remaining: 20,
    });

    await expect(
      optimizeImage({
        input: path.join(tmpDir, "hero.png"),
        baseUrl: "https://api.tinify.ai",
      })
    ).rejects.toThrow("No job created by the server.");
  });

  it("persists session token returned from upload", async () => {
    let capturedSaveToken: ReturnType<typeof vi.fn> | undefined;
    vi.mocked(SessionManager).mockImplementation(() => {
      capturedSaveToken = vi.fn();
      return {
        sessionDir: "/tmp/.tinify",
        getAuthHeaders: vi.fn().mockReturnValue({}),
        saveToken: capturedSaveToken,
      } as any;
    });

    vi.mocked(uploadFile).mockResolvedValueOnce({
      temp_file_id: "temp-1",
      original_filename: "hero.png",
      file_size: 50000,
      mime_type: "image/png",
      session_token: "fresh-token-xyz",
    });
    vi.mocked(triggerProcessing).mockResolvedValueOnce({
      success: true,
      jobs: [{ id: "job-1", temp_file_id: "temp-1", status: "queued" }],
      credits_used: 4,
      credits_remaining: 16,
    });
    vi.mocked(waitForCompletion).mockResolvedValueOnce({
      job_id: "job-1",
      status: "completed",
      processed_size: 30000,
      processed_format: "png",
    });
    vi.mocked(downloadFile).mockResolvedValueOnce({
      buffer: Buffer.from("data"),
      filename: "hero.tinified.png",
    });

    await optimizeImage({
      input: path.join(tmpDir, "hero.png"),
      baseUrl: "https://api.tinify.ai",
    });

    expect(capturedSaveToken).toHaveBeenCalledWith("fresh-token-xyz");
  });

  it("uses download buffer length when processed_size is null", async () => {
    vi.mocked(uploadFile).mockResolvedValueOnce({
      temp_file_id: "temp-1",
      original_filename: "hero.png",
      file_size: 50000,
      mime_type: "image/png",
      session_token: null,
    });
    vi.mocked(triggerProcessing).mockResolvedValueOnce({
      success: true,
      jobs: [{ id: "job-1", temp_file_id: "temp-1", status: "queued" }],
      credits_used: 4,
      credits_remaining: 16,
    });
    vi.mocked(waitForCompletion).mockResolvedValueOnce({
      job_id: "job-1",
      status: "completed",
      processed_size: null,
      processed_format: "png",
    });
    vi.mocked(downloadFile).mockResolvedValueOnce({
      buffer: Buffer.alloc(12345),
      filename: "hero.tinified.png",
    });

    const result = await optimizeImage({
      input: path.join(tmpDir, "hero.png"),
      baseUrl: "https://api.tinify.ai",
    });

    expect(result.output_size_bytes).toBe(12345);
  });

  it("passes upscale_factor and resize_behavior to processing settings", async () => {
    vi.mocked(uploadFile).mockResolvedValueOnce({
      temp_file_id: "temp-1",
      original_filename: "hero.png",
      file_size: 50000,
      mime_type: "image/png",
      session_token: null,
    });
    vi.mocked(triggerProcessing).mockResolvedValueOnce({
      success: true,
      jobs: [{ id: "job-1", temp_file_id: "temp-1", status: "queued" }],
      credits_used: 7,
      credits_remaining: 13,
    });
    vi.mocked(waitForCompletion).mockResolvedValueOnce({
      job_id: "job-1",
      status: "completed",
      processed_size: 20000,
      processed_format: "png",
    });
    vi.mocked(downloadFile).mockResolvedValueOnce({
      buffer: Buffer.from("data"),
      filename: "hero.tinified.png",
    });

    await optimizeImage({
      input: path.join(tmpDir, "hero.png"),
      baseUrl: "https://api.tinify.ai",
      output_upscale_factor: 2,
      output_width_px: 1920,
      output_height_px: 1080,
      output_resize_behavior: "crop",
    });

    const processCall = vi.mocked(triggerProcessing).mock.calls[0][0];
    expect(processCall.settings.output_upscale_factor).toBe(2);
    expect(processCall.settings.output_resize_behavior).toBe("crop");
  });

  describe("resize_behavior derivation from dimension inputs", () => {
    function mockSuccessFlow() {
      vi.mocked(uploadFile).mockResolvedValueOnce({
        temp_file_id: "temp-1",
        original_filename: "hero.png",
        file_size: 50000,
        mime_type: "image/png",
        session_token: null,
      });
      vi.mocked(triggerProcessing).mockResolvedValueOnce({
        success: true,
        jobs: [{ id: "job-1", temp_file_id: "temp-1", status: "queued" }],
        credits_used: 4,
        credits_remaining: 16,
      });
      vi.mocked(waitForCompletion).mockResolvedValueOnce({
        job_id: "job-1",
        status: "completed",
        processed_size: 20000,
        processed_format: "png",
        processed_width: 2048,
        processed_height: 2048,
      });
      vi.mocked(downloadFile).mockResolvedValueOnce({
        buffer: Buffer.from("data"),
        filename: "hero.tinified.png",
      });
    }

    it("defaults resize_behavior=pad when both dimensions specified", async () => {
      mockSuccessFlow();

      await optimizeImage({
        input: path.join(tmpDir, "hero.png"),
        baseUrl: "https://api.tinify.ai",
        output_width_px: 2048,
        output_height_px: 2048,
      });

      const processCall = vi.mocked(triggerProcessing).mock.calls[0][0];
      expect(processCall.settings.output_resize_behavior).toBe("pad");
    });

    it("uses crop mode when both dimensions + output_resize_behavior='crop'", async () => {
      mockSuccessFlow();

      await optimizeImage({
        input: path.join(tmpDir, "hero.png"),
        baseUrl: "https://api.tinify.ai",
        output_width_px: 2048,
        output_height_px: 2048,
        output_resize_behavior: "crop",
      });

      const processCall = vi.mocked(triggerProcessing).mock.calls[0][0];
      expect(processCall.settings.output_resize_behavior).toBe("crop");
    });

    it("defaults resize_behavior=pad when only width is specified", async () => {
      mockSuccessFlow();

      await optimizeImage({
        input: path.join(tmpDir, "hero.png"),
        baseUrl: "https://api.tinify.ai",
        output_width_px: 2048,
      });

      const processCall = vi.mocked(triggerProcessing).mock.calls[0][0];
      expect(processCall.settings.output_resize_behavior).toBe("pad");
    });

    it("defaults resize_behavior=pad when only height is specified", async () => {
      mockSuccessFlow();

      await optimizeImage({
        input: path.join(tmpDir, "hero.png"),
        baseUrl: "https://api.tinify.ai",
        output_height_px: 1080,
      });

      const processCall = vi.mocked(triggerProcessing).mock.calls[0][0];
      expect(processCall.settings.output_resize_behavior).toBe("pad");
    });

    it("does NOT set output_resize_behavior when no dimensions are specified", async () => {
      mockSuccessFlow();

      await optimizeImage({
        input: path.join(tmpDir, "hero.png"),
        baseUrl: "https://api.tinify.ai",
      });

      const processCall = vi.mocked(triggerProcessing).mock.calls[0][0];
      expect(processCall.settings.output_resize_behavior).toBeUndefined();
    });
  });

  describe("SEO filename on disk", () => {
    function mockWithSeoFilename(seoFilename: string | null | undefined) {
      vi.mocked(uploadFile).mockResolvedValueOnce({
        temp_file_id: "temp-1",
        original_filename: "hero.png",
        file_size: 50000,
        mime_type: "image/png",
        session_token: null,
      });
      vi.mocked(triggerProcessing).mockResolvedValueOnce({
        success: true,
        jobs: [{ id: "job-1", temp_file_id: "temp-1", status: "queued" }],
        credits_used: 4,
        credits_remaining: 16,
      });
      vi.mocked(waitForCompletion).mockResolvedValueOnce({
        job_id: "job-1",
        status: "completed",
        processed_size: 30000,
        processed_format: "png",
        seo_filename: seoFilename,
      });
      vi.mocked(downloadFile).mockResolvedValueOnce({
        buffer: Buffer.from("data"),
        filename: "hero.tinified.png",
      });
    }

    it("saves file with SEO slug when seo_filename returned and seo_tag_gen enabled (default)", async () => {
      mockWithSeoFilename("scenic-mountain-hero");

      const result = await optimizeImage({
        input: path.join(tmpDir, "hero.png"),
        baseUrl: "https://api.tinify.ai",
      });

      expect(result.output_path).toContain("scenic-mountain-hero.png");
      expect(result.output_path).not.toContain("tinified");
      expect(fs.existsSync(result.output_path)).toBe(true);
    });

    it("falls back to tinified pattern when output_seo_tag_gen=false", async () => {
      mockWithSeoFilename("scenic-mountain-hero");

      const result = await optimizeImage({
        input: path.join(tmpDir, "hero.png"),
        baseUrl: "https://api.tinify.ai",
        output_seo_tag_gen: false,
      });

      expect(result.output_path).toContain("hero.tinified.png");
    });

    it("falls back to tinified pattern when seo_filename is null", async () => {
      mockWithSeoFilename(null);

      const result = await optimizeImage({
        input: path.join(tmpDir, "hero.png"),
        baseUrl: "https://api.tinify.ai",
      });

      expect(result.output_path).toContain("hero.tinified.png");
    });

    it("explicit full output_path is always used regardless of SEO filename", async () => {
      mockWithSeoFilename("some-seo-slug");

      const explicitPath = path.join(tmpDir, "custom.png");
      const result = await optimizeImage({
        input: path.join(tmpDir, "hero.png"),
        output_path: explicitPath,
        baseUrl: "https://api.tinify.ai",
      });

      expect(result.output_path).toBe(explicitPath);
    });

    it("uses SEO filename inside directory output_path", async () => {
      mockWithSeoFilename("product-photo");

      const dirPath = path.join(tmpDir, "output") + "/";
      const result = await optimizeImage({
        input: path.join(tmpDir, "hero.png"),
        output_path: dirPath,
        baseUrl: "https://api.tinify.ai",
      });

      expect(result.output_path).toContain("product-photo.png");
      expect(result.output_path).toContain(path.join(tmpDir, "output"));
    });
  });

  it("creates parent directories if output_path doesn't exist", async () => {
    vi.mocked(uploadFile).mockResolvedValueOnce({
      temp_file_id: "temp-1",
      original_filename: "hero.png",
      file_size: 50000,
      mime_type: "image/png",
      session_token: null,
    });
    vi.mocked(triggerProcessing).mockResolvedValueOnce({
      success: true,
      jobs: [{ id: "job-1", temp_file_id: "temp-1", status: "queued" }],
      credits_used: 4,
      credits_remaining: 16,
    });
    vi.mocked(waitForCompletion).mockResolvedValueOnce({
      job_id: "job-1",
      status: "completed",
      processed_size: 30000,
      processed_format: "png",
      processed_width: 800,
      processed_height: 600,
      processed_compression_ratio: 0.6,
    });
    vi.mocked(downloadFile).mockResolvedValueOnce({
      buffer: Buffer.from("data"),
      filename: "hero.png",
    });

    const deepPath = path.join(tmpDir, "deep", "nested", "dir", "out.png");
    const result = await optimizeImage({
      input: path.join(tmpDir, "hero.png"),
      output_path: deepPath,
      baseUrl: "https://api.tinify.ai",
    });

    expect(result.output_path).toBe(deepPath);
    expect(fs.existsSync(deepPath)).toBe(true);
  });
});
