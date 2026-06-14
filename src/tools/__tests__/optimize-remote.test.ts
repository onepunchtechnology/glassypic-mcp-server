import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock API modules to avoid real HTTP calls in the download URL test
vi.mock("../../api/upload.js", () => ({ uploadFile: vi.fn(), uploadUrl: vi.fn() }));
vi.mock("../../api/process.js", () => ({ triggerProcessing: vi.fn() }));
vi.mock("../../api/status.js", () => ({ waitForCompletion: vi.fn() }));
vi.mock("../../api/download.js", () => ({ downloadFile: vi.fn() }));
vi.mock("../../session/manager.js", () => ({
  SessionManager: vi.fn(() => ({ getAuthHeaders: vi.fn().mockReturnValue({}), saveToken: vi.fn() })),
}));
vi.mock("../../api/client.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../api/client.js")>();
  return { ...original, getAuthHeaders: vi.fn().mockReturnValue({}) };
});

describe("optimize_image in remote mode", () => {
  beforeEach(() => {
    process.env.MCP_TRANSPORT = "http";
  });
  afterEach(() => {
    delete process.env.MCP_TRANSPORT;
    vi.clearAllMocks();
  });

  it("rejects local file paths in HTTP mode", async () => {
    const { resolveInput } = await import("../optimize.js");
    expect(() => resolveInput("/Users/test/image.png")).toThrow(
      /local file paths are not supported/i
    );
  });

  it("accepts URLs in HTTP mode", async () => {
    // Stub fetch so the URL branch of resolveInput does not make a real network
    // call (the test must stay hermetic and the promise must be awaited).
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const { resolveInput } = await import("../optimize.js");
      const resolved = await resolveInput("https://example.com/image.png");

      expect(resolved.isUrl).toBe(true);
      expect(resolved.filename).toBe("image.png");
      expect(fetchMock).toHaveBeenCalledWith("https://example.com/image.png");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("returns download URL instead of local path in HTTP mode", async () => {
    const { uploadUrl } = await import("../../api/upload.js");
    const { triggerProcessing } = await import("../../api/process.js");
    const { waitForCompletion } = await import("../../api/status.js");

    vi.mocked(uploadUrl).mockResolvedValueOnce({
      temp_file_id: "temp-1",
      original_filename: "photo.jpg",
      file_size: 100000,
      mime_type: "image/jpeg",
      session_token: null,
    });
    vi.mocked(triggerProcessing).mockResolvedValueOnce({
      success: true,
      jobs: [{ id: "job-abc", temp_file_id: "temp-1", status: "queued" }],
      credits_used: 3,
      credits_remaining: 17,
    });
    vi.mocked(waitForCompletion).mockResolvedValueOnce({
      job_id: "job-abc",
      status: "completed",
      processed_size: 45000,
      processed_format: "jpg",
      processed_width: 1920,
      processed_height: 1080,
      processed_compression_ratio: 0.45,
      seo_alt_text: "A photo",
      seo_keywords: ["photo"],
      seo_filename: "photo",
    });

    const { optimizeImage } = await import("../optimize.js");
    const result = await optimizeImage({
      input: "https://example.com/photo.jpg",
      baseUrl: "https://api.tinify.ai",
    });

    // Should return download URL, not a local path
    expect(result.output_path).toBe("https://api.tinify.ai/download/job-abc");
    expect(result.output_size_bytes).toBe(45000);
    expect(result.output_format).toBe("jpg");
  });
});
