import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadFile, uploadUrl } from "../upload.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("uploadFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uploads a file and returns temp_file_id and session_token", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        temp_file_id: "temp-123",
        original_filename: "hero.png",
        file_size: 50000,
        mime_type: "image/png",
        session_token: "session-abc",
      }),
    });

    const result = await uploadFile({
      baseUrl: "https://api.tinify.ai",
      fileBuffer: Buffer.from("fake-image"),
      filename: "hero.png",
      authHeaders: {},
    });

    expect(result.temp_file_id).toBe("temp-123");
    expect(result.session_token).toBe("session-abc");

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.tinify.ai/upload");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
  });

  it("includes session token header when provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        temp_file_id: "temp-456",
        session_token: null,
      }),
    });

    await uploadFile({
      baseUrl: "https://api.tinify.ai",
      fileBuffer: Buffer.from("fake"),
      filename: "test.jpg",
      authHeaders: { "X-Session-Token": "existing-token" },
    });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-Session-Token"]).toBe("existing-token");
  });

  it("throws on upload failure with error message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 415,
      json: async () => ({ detail: "Unsupported file type" }),
    });

    await expect(
      uploadFile({
        baseUrl: "https://api.tinify.ai",
        fileBuffer: Buffer.from("fake"),
        filename: "bad.bmp",
        authHeaders: {},
      })
    ).rejects.toThrow("Unsupported image format");
  });

  it("throws on file too large (413)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 413,
      json: async () => ({ detail: "File too large" }),
    });

    await expect(
      uploadFile({
        baseUrl: "https://api.tinify.ai",
        fileBuffer: Buffer.from("huge"),
        filename: "big.png",
        authHeaders: {},
      })
    ).rejects.toThrow("File exceeds maximum size limit");
  });

  it("does not send X-Session-Token header when sessionToken is null", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        temp_file_id: "temp-789",
        original_filename: "test.png",
        file_size: 1000,
        mime_type: "image/png",
        session_token: null,
      }),
    });

    await uploadFile({
      baseUrl: "https://api.tinify.ai",
      fileBuffer: Buffer.from("data"),
      filename: "test.png",
      authHeaders: {},
    });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-Session-Token"]).toBeUndefined();
  });

  it("throws generic API error on 500 with server detail", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ detail: "Internal server error" }),
    });

    await expect(
      uploadFile({
        baseUrl: "https://api.tinify.ai",
        fileBuffer: Buffer.from("data"),
        filename: "test.png",
        authHeaders: {},
      })
    ).rejects.toThrow("Internal server error");
  });
});

describe("uploadUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends JSON body with url and filename", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        temp_file_id: "temp-url-1",
        original_filename: "photo.jpg",
        file_size: 50000,
        mime_type: "image/jpeg",
        session_token: "session-xyz",
      }),
    });

    const result = await uploadUrl({
      baseUrl: "https://api.tinify.ai",
      url: "https://cdn.example.com/photo.jpg",
      filename: "custom-name.jpg",
      authHeaders: { "X-Session-Token": "tok" },
    });

    expect(result.temp_file_id).toBe("temp-url-1");

    const [callUrl, options] = mockFetch.mock.calls[0];
    expect(callUrl).toBe("https://api.tinify.ai/upload/url");
    expect(options.method).toBe("POST");
    expect(options.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(options.body);
    expect(body.url).toBe("https://cdn.example.com/photo.jpg");
    expect(body.filename).toBe("custom-name.jpg");
  });

  it("omits filename when not provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        temp_file_id: "temp-url-2",
        original_filename: "image.png",
        file_size: 30000,
        mime_type: "image/png",
        session_token: null,
      }),
    });

    await uploadUrl({
      baseUrl: "https://api.tinify.ai",
      url: "https://cdn.example.com/image.png",
      authHeaders: {},
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.filename).toBeUndefined();
  });

  it("throws on 502 fetch failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ detail: "Failed to fetch URL: connection timeout" }),
    });

    await expect(
      uploadUrl({
        baseUrl: "https://api.tinify.ai",
        url: "https://unreachable.example.com/img.jpg",
        authHeaders: {},
      })
    ).rejects.toThrow("Failed to fetch URL");
  });

  it("throws on 413 file too large", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 413,
      json: async () => ({ detail: "File exceeds maximum size of 50MB" }),
    });

    await expect(
      uploadUrl({
        baseUrl: "https://api.tinify.ai",
        url: "https://example.com/huge.tiff",
        authHeaders: {},
      })
    ).rejects.toThrow("File exceeds maximum size");
  });
});
