/**
 * Integration tests for API clients against a real local HTTP server.
 * These tests do NOT mock `fetch` — they verify the full request/response
 * cycle including headers, body serialization, and error parsing.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import * as http from "node:http";
import * as net from "node:net";
import { uploadFile } from "../upload.js";
import { triggerProcessing } from "../process.js";
import { downloadFile } from "../download.js";

type ServerHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body: Buffer,
) => void | Promise<void>;

function createTestServer() {
  let handler: ServerHandler = (_req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ detail: "No handler set for this test" }));
  };

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(chunk as Buffer);
    }
    try {
      await handler(req, res, Buffer.concat(chunks));
    } catch {
      res.writeHead(500);
      res.end(JSON.stringify({ detail: "Test server error" }));
    }
  });

  let baseUrl = "";

  return {
    async start(): Promise<string> {
      await new Promise<void>((resolve, reject) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address() as net.AddressInfo;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
        server.once("error", reject);
      });
      return baseUrl;
    },

    async stop(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },

    setHandler(fn: ServerHandler) {
      handler = fn;
    },

    get url() {
      return baseUrl;
    },
  };
}

describe("API integration tests (real HTTP server, no fetch mock)", () => {
  const testServer = createTestServer();
  let baseUrl: string;

  beforeAll(async () => {
    baseUrl = await testServer.start();
  });

  afterAll(async () => {
    await testServer.stop();
  });

  afterEach(() => {
    // Reset to default 500 handler between tests
    testServer.setHandler((_req, res) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ detail: "No handler set" }));
    });
  });

  describe("uploadFile", () => {
    it("sends multipart form data and correctly parses the upload response", async () => {
      let receivedMethod = "";
      let receivedContentType = "";

      testServer.setHandler((req, res) => {
        receivedMethod = req.method ?? "";
        receivedContentType = req.headers["content-type"] ?? "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            temp_file_id: "temp-real-123",
            original_filename: "hero.png",
            file_size: 9,
            mime_type: "image/png",
            session_token: "sess-real",
          }),
        );
      });

      const result = await uploadFile({
        baseUrl,
        fileBuffer: Buffer.from("fake-png"),
        filename: "hero.png",
        authHeaders: {},
      });

      expect(result.temp_file_id).toBe("temp-real-123");
      expect(result.session_token).toBe("sess-real");
      expect(receivedMethod).toBe("POST");
      expect(receivedContentType).toMatch(/multipart\/form-data/);
    });

    it("sends X-Session-Token header to the real server when provided", async () => {
      let receivedToken = "";

      testServer.setHandler((req, res) => {
        receivedToken = (req.headers["x-session-token"] as string) ?? "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            temp_file_id: "temp-456",
            original_filename: "photo.jpg",
            file_size: 100,
            mime_type: "image/jpeg",
            session_token: null,
          }),
        );
      });

      await uploadFile({
        baseUrl,
        fileBuffer: Buffer.from("data"),
        filename: "photo.jpg",
        authHeaders: { "X-Session-Token": "existing-session" },
      });

      expect(receivedToken).toBe("existing-session");
    });

    it("throws ApiError on 413 response from real server", async () => {
      testServer.setHandler((_req, res) => {
        res.writeHead(413, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "File too large" }));
      });

      await expect(
        uploadFile({
          baseUrl,
          fileBuffer: Buffer.from("huge"),
          filename: "huge.png",
          authHeaders: {},
        }),
      ).rejects.toThrow("File exceeds maximum size limit");
    });

    it("throws ApiError on 415 response from real server", async () => {
      testServer.setHandler((_req, res) => {
        res.writeHead(415, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "Unsupported file type" }));
      });

      await expect(
        uploadFile({
          baseUrl,
          fileBuffer: Buffer.from("data"),
          filename: "bad.bmp",
          authHeaders: {},
        }),
      ).rejects.toThrow("Unsupported image format");
    });
  });

  describe("triggerProcessing", () => {
    it("sends JSON body with temp_file_ids and settings, parses response", async () => {
      let parsedBody: any;

      testServer.setHandler(async (_req, res, body) => {
        parsedBody = JSON.parse(body.toString());
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            jobs: [{ id: "job-real-1", temp_file_id: "temp-1", status: "queued" }],
            credits_used: 4,
            credits_remaining: 16,
          }),
        );
      });

      const result = await triggerProcessing({
        baseUrl,
        tempFileIds: ["temp-1"],
        settings: { output_format: "webp", output_seo_tag_gen: true },
        authHeaders: {},
      });

      expect(result.jobs[0].id).toBe("job-real-1");
      expect(result.credits_used).toBe(4);
      expect(parsedBody.temp_file_ids).toEqual(["temp-1"]);
      expect(parsedBody.settings.output_format).toBe("webp");
      expect(parsedBody.settings.output_seo_tag_gen).toBe(true);
    });

    it("sends request to /auto endpoint", async () => {
      let requestedPath = "";

      testServer.setHandler((req, res) => {
        requestedPath = req.url ?? "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            jobs: [{ id: "job-1", temp_file_id: "temp-1", status: "queued" }],
            credits_used: 4,
            credits_remaining: 16,
          }),
        );
      });

      await triggerProcessing({
        baseUrl,
        tempFileIds: ["temp-1"],
        settings: {},
        authHeaders: {},
      });

      expect(requestedPath).toBe("/auto");
    });

    it("throws ApiError on 429 (insufficient credits) from real server", async () => {
      testServer.setHandler((_req, res) => {
        res.writeHead(429, {
          "Content-Type": "application/json",
          "X-RateLimit-Remaining": "0",
          "Retry-After": "86400",
        });
        res.end(JSON.stringify({ detail: "Insufficient credits. Need 4, have 0." }));
      });

      await expect(
        triggerProcessing({
          baseUrl,
          tempFileIds: ["temp-1"],
          settings: {},
          authHeaders: {},
        }),
      ).rejects.toThrow(/Insufficient credits/);
    });
  });

  describe("downloadFile", () => {
    it("downloads binary data and extracts filename from Content-Disposition", async () => {
      const imageData = Buffer.from("binary-image-data");

      testServer.setHandler((_req, res) => {
        res.writeHead(200, {
          "Content-Type": "image/webp",
          "Content-Disposition": 'attachment; filename="hero.polished.webp"',
        });
        res.end(imageData);
      });

      const result = await downloadFile({ baseUrl, jobId: "job-real-1" });

      expect(result.buffer).toEqual(imageData);
      expect(result.filename).toBe("hero.polished.webp");
    });

    it("constructs the correct download URL with the job ID", async () => {
      let requestedPath = "";

      testServer.setHandler((req, res) => {
        requestedPath = req.url ?? "";
        res.writeHead(200, {
          "Content-Type": "image/png",
          "Content-Disposition": 'attachment; filename="out.png"',
        });
        res.end(Buffer.from("data"));
      });

      await downloadFile({ baseUrl, jobId: "job-xyz-789" });

      expect(requestedPath).toBe("/download/job-xyz-789");
    });

    it("throws ApiError on 410 (expired job) from real server", async () => {
      testServer.setHandler((_req, res) => {
        res.writeHead(410, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "Job has expired" }));
      });

      await expect(
        downloadFile({ baseUrl, jobId: "expired-job" }),
      ).rejects.toThrow("Job has expired");
    });

    it("throws ApiError on 404 (job not found) from real server", async () => {
      testServer.setHandler((_req, res) => {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ detail: "Not found" }));
      });

      await expect(
        downloadFile({ baseUrl, jobId: "missing-job" }),
      ).rejects.toThrow("Job not found");
    });
  });
});
