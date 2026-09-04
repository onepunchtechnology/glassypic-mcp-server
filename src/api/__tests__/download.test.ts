import { describe, it, expect, vi, beforeEach } from "vitest";
import { downloadFile } from "../download.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("downloadFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("downloads file and returns buffer with filename", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers({
        "Content-Disposition": 'attachment; filename="hero.polished.webp"',
      }),
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    const result = await downloadFile({
      baseUrl: "https://api.tinify.ai",
      jobId: "job-1",
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.buffer.length).toBe(100);
    expect(result.filename).toBe("hero.polished.webp");
  });

  it("sends auth headers when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(1),
    });

    await downloadFile({
      baseUrl: "https://api.tinify.ai",
      jobId: "job-1",
      authHeaders: { "X-Session-Token": "guest-token" },
    });

    expect(mockFetch).toHaveBeenCalledWith("https://api.tinify.ai/download/job-1", {
      headers: { "X-Session-Token": "guest-token" },
    });
  });

  it("throws on expired job (410)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 410,
      json: async () => ({ detail: "Job expired" }),
    });

    await expect(
      downloadFile({ baseUrl: "https://api.tinify.ai", jobId: "job-1" })
    ).rejects.toThrow("Job has expired");
  });

  it("throws on job not completed (400)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ detail: "Job not completed" }),
    });

    await expect(
      downloadFile({ baseUrl: "https://api.tinify.ai", jobId: "job-1" })
    ).rejects.toThrow("Job not completed");
  });

  it("throws on job not found (404)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ detail: "Job not found" }),
    });

    await expect(
      downloadFile({ baseUrl: "https://api.tinify.ai", jobId: "job-1" })
    ).rejects.toThrow("Job not found");
  });

  it("throws generic error on 500", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Server error" }),
    });

    await expect(
      downloadFile({ baseUrl: "https://api.tinify.ai", jobId: "job-1" })
    ).rejects.toThrow("Server error");
  });

  it("uses fallback filename 'output' when Content-Disposition header is absent", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: new Headers(),
      arrayBuffer: async () => new ArrayBuffer(50),
    });

    const result = await downloadFile({
      baseUrl: "https://api.tinify.ai",
      jobId: "job-1",
    });

    expect(result.filename).toBe("output");
    expect(result.buffer.length).toBe(50);
  });
});
