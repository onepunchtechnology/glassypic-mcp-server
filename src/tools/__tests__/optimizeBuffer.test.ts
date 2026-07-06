import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/uploadBuffer.js", () => ({
  uploadBuffer: vi.fn(async () => ({ temp_file_id: "t1" })),
}));
vi.mock("../../api/process.js", () => ({
  triggerProcessing: vi.fn(),
}));
vi.mock("../../api/status.js", () => ({
  waitForCompletion: vi.fn(),
}));

import { ApiError } from "../../api/client.js";
import { triggerProcessing } from "../../api/process.js";
import { waitForCompletion } from "../../api/status.js";
import { uploadBuffer } from "../../api/uploadBuffer.js";
import { optimizeBuffer } from "../optimizeBuffer.js";

const fetchMock = vi.fn();
let tmpHome: string;
let originalHome: string | undefined;
let originalUserProfile: string | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "glassypic-optimize-buffer-"));
  originalHome = process.env.HOME;
  originalUserProfile = process.env.USERPROFILE;
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

describe("optimizeBuffer", () => {
  it("uploads bytes, processes, and returns result bytes + alt text from processed fields", async () => {
    vi.mocked(triggerProcessing).mockResolvedValue({
      success: true,
      jobs: [{ id: "j1", temp_file_id: "t1", status: "queued" }],
      credits_used: 5,
      credits_remaining: 95,
    });
    vi.mocked(waitForCompletion).mockResolvedValue({
      job_id: "j1",
      status: "completed",
      processed_width: 1080,
      processed_height: 1920,
      processed_size: 400000,
      seo_alt_text: "a cat",
    });
    fetchMock.mockResolvedValue(new Response(new Uint8Array([9, 9, 9]), { status: 200 }));

    const out = await optimizeBuffer({
      bytes: Buffer.from([1, 2, 3]),
      filename: "cat.png",
      mimetype: "image/png",
      output_width_px: 1080,
      output_height_px: 1920,
      output_resize_behavior: "crop",
      output_seo_tag_gen: true,
      authToken: "guest_1",
      idempotencyKey: "slack:T1:trig1:instagram_story",
      baseUrl: "https://api.test",
    });

    expect(Array.from(out.bytes)).toEqual([9, 9, 9]);
    expect(out.output_width_px).toBe(1080);
    expect(out.output_height_px).toBe(1920);
    expect(out.output_size_bytes).toBe(400000);
    expect(out.seo_alt_text).toBe("a cat");
    const call = vi.mocked(triggerProcessing).mock.calls[0][0];
    expect(call.idempotencyKey).toBe("slack:T1:trig1:instagram_story");
    expect(call.authHeaders["X-Session-Token"]).toBe("guest_1");
  });

  it("passes the requested output_format through and returns the ACTUAL processed_format", async () => {
    vi.mocked(triggerProcessing).mockResolvedValue({
      success: true,
      jobs: [{ id: "j1", temp_file_id: "t1", status: "queued" }],
      credits_used: 5,
      credits_remaining: 95,
    });
    vi.mocked(waitForCompletion).mockResolvedValue({
      job_id: "j1",
      status: "completed",
      processed_width: 1080,
      processed_height: 1920,
      processed_size: 400000,
      processed_format: "png",
      seo_filename: "a-logo",
    });
    fetchMock.mockResolvedValue(new Response(new Uint8Array([9, 9, 9]), { status: 200 }));

    const out = await optimizeBuffer({
      bytes: Buffer.from([1, 2, 3]),
      filename: "logo.png",
      mimetype: "image/png",
      output_width_px: 1080,
      output_height_px: 1920,
      output_resize_behavior: "crop",
      output_format: "png",
      authToken: "guest_1",
      idempotencyKey: "k",
      baseUrl: "https://api.test",
    });

    const call = vi.mocked(triggerProcessing).mock.calls[0][0];
    expect(call.settings.output_format).toBe("png");
    expect(out.processed_format).toBe("png");
    expect(out.seo_filename).toBe("a-logo");
  });

  it("defaults output_format to 'original' when the caller doesn't specify one", async () => {
    vi.mocked(triggerProcessing).mockResolvedValue({
      success: true,
      jobs: [{ id: "j1", temp_file_id: "t1", status: "queued" }],
      credits_used: 5,
      credits_remaining: 95,
    });
    vi.mocked(waitForCompletion).mockResolvedValue({
      job_id: "j1", status: "completed", processed_size: 1000, processed_format: "jpg",
    });
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));

    await optimizeBuffer({
      bytes: Buffer.from([1]), filename: "c.png", mimetype: "image/png",
      output_width_px: 1200, output_height_px: 630, output_resize_behavior: "pad",
      authToken: "t", idempotencyKey: "k", baseUrl: "https://api.test",
    });

    expect(vi.mocked(triggerProcessing).mock.calls[0][0].settings.output_format).toBe("original");
  });

  it("rejects a blank tenant auth token before using ambient credentials", async () => {
    const sessionDir = path.join(tmpHome, ".glassypic");
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, "session.json"),
      JSON.stringify({ session_token: "guest_local", mcp_token: "mcp_local" }),
    );

    await expect(
      optimizeBuffer({
        bytes: Buffer.from([1]),
        filename: "c.png",
        mimetype: "image/png",
        output_width_px: 1200,
        output_height_px: 630,
        output_resize_behavior: "pad",
        authToken: "",
        idempotencyKey: "k",
        baseUrl: "https://api.test",
      }),
    ).rejects.toThrow("Explicit auth token must not be blank.");

    expect(vi.mocked(uploadBuffer)).not.toHaveBeenCalled();
    expect(vi.mocked(triggerProcessing)).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates a 429 carrying the parsed body for the conversion card", async () => {
    vi.mocked(triggerProcessing).mockRejectedValue(
      new ApiError("insufficient", 429, "insufficient", {
        tier: "slack",
        credits_reset_at: "2026-07-01T08:00:00Z",
      }),
    );

    await expect(
      optimizeBuffer({
        bytes: Buffer.from([1]),
        filename: "c.png",
        mimetype: "image/png",
        output_width_px: 1200,
        output_height_px: 630,
        output_resize_behavior: "pad",
        authToken: "t",
        idempotencyKey: "k",
        baseUrl: "https://api.test",
      }),
    ).rejects.toMatchObject({
      status: 429,
      body: { credits_reset_at: "2026-07-01T08:00:00Z" },
    });
  });
});
