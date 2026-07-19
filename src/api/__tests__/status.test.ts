import { describe, it, expect, vi } from "vitest";
import { waitForCompletion, type CompletedJob } from "../status.js";

describe("waitForCompletion", () => {
  it("passes auth headers to the stream via the eventsource fetch option", async () => {
    const ctor = vi.fn(() => ({ addEventListener: vi.fn(), close: vi.fn() }));
    vi.stubGlobal("EventSource", ctor);
    const realFetch = vi.fn(async () => new Response(null));
    vi.stubGlobal("fetch", realFetch);

    waitForCompletion({
      baseUrl: "https://api.tinify.ai",
      jobId: "job-1",
      timeoutMs: 60000,
      headers: { Authorization: "Bearer mcp_abc" },
    });

    // Second constructor arg carries a fetch that injects the auth headers.
    const options = ctor.mock.calls[0][1] as { fetch?: Function } | undefined;
    expect(options?.fetch).toBeInstanceOf(Function);
    await options!.fetch!("https://api.tinify.ai/status/job-1/stream", {
      headers: { Accept: "text/event-stream" },
    });
    const passedInit = realFetch.mock.calls[0][1] as { headers: Record<string, string> };
    expect(passedInit.headers).toMatchObject({
      Accept: "text/event-stream",
      Authorization: "Bearer mcp_abc",
    });
  });

  it("resolves with job data on complete event", async () => {
    const listeners: Record<string, (event: any) => void> = {};
    const mockEventSource = {
      addEventListener: vi.fn((event: string, handler: any) => {
        listeners[event] = handler;
      }),
      close: vi.fn(),
    };

    vi.stubGlobal("EventSource", vi.fn(() => mockEventSource));

    const promise = waitForCompletion({
      baseUrl: "https://api.tinify.ai",
      jobId: "job-1",
      timeoutMs: 60000,
    });

    listeners["complete"]({
      data: JSON.stringify({
        job_id: "job-1",
        status: "completed",
        processed_size: 48000,
        processed_format: "webp",
        processed_width: 1920,
        processed_height: 1080,
        processed_compression_ratio: 0.72,
        seo_alt_text: "A test image",
        seo_filename: "test-image",
        seo_keywords: ["test"],
      }),
    });

    const result = await promise;
    expect(result.status).toBe("completed");
    expect(result.processed_size).toBe(48000);
    expect(result.processed_compression_ratio).toBe(0.72);
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it("rejects on error event", async () => {
    const listeners: Record<string, (event: any) => void> = {};
    const mockEventSource = {
      addEventListener: vi.fn((event: string, handler: any) => {
        listeners[event] = handler;
      }),
      close: vi.fn(),
    };

    vi.stubGlobal("EventSource", vi.fn(() => mockEventSource));

    const promise = waitForCompletion({
      baseUrl: "https://api.tinify.ai",
      jobId: "job-1",
      timeoutMs: 60000,
    });

    listeners["complete"]({
      data: JSON.stringify({
        job_id: "job-1",
        status: "failed",
        error: "TinyPNG API error",
      }),
    });

    await expect(promise).rejects.toThrow("Processing failed: TinyPNG API error");
  });

  it("rejects on SSE error event with message data", async () => {
    const listeners: Record<string, (event: any) => void> = {};
    const mockEventSource = {
      addEventListener: vi.fn((event: string, handler: any) => {
        listeners[event] = handler;
      }),
      close: vi.fn(),
    };

    vi.stubGlobal("EventSource", vi.fn(() => mockEventSource));

    const promise = waitForCompletion({
      baseUrl: "https://api.tinify.ai",
      jobId: "job-1",
      timeoutMs: 60000,
    });

    listeners["error"]({ data: JSON.stringify({ message: "Connection reset by peer" }) });

    await expect(promise).rejects.toThrow("Processing error: Connection reset by peer");
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it("rejects on SSE error event with no data (connection dropped)", async () => {
    const listeners: Record<string, (event: any) => void> = {};
    const mockEventSource = {
      addEventListener: vi.fn((event: string, handler: any) => {
        listeners[event] = handler;
      }),
      close: vi.fn(),
    };

    vi.stubGlobal("EventSource", vi.fn(() => mockEventSource));

    const promise = waitForCompletion({
      baseUrl: "https://api.tinify.ai",
      jobId: "job-1",
      timeoutMs: 60000,
    });

    listeners["error"]({ data: null });

    await expect(promise).rejects.toThrow("Processing error: Connection lost");
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it("rejects on server-side timeout event", async () => {
    const listeners: Record<string, (event: any) => void> = {};
    const mockEventSource = {
      addEventListener: vi.fn((event: string, handler: any) => {
        listeners[event] = handler;
      }),
      close: vi.fn(),
    };

    vi.stubGlobal("EventSource", vi.fn(() => mockEventSource));

    const promise = waitForCompletion({
      baseUrl: "https://api.tinify.ai",
      jobId: "job-1",
      timeoutMs: 60000,
    });

    listeners["timeout"]({});

    await expect(promise).rejects.toThrow("Processing timed out");
    expect(mockEventSource.close).toHaveBeenCalled();
  });

  it("opens SSE connection to the correct URL", () => {
    const mockEventSource = {
      addEventListener: vi.fn(),
      close: vi.fn(),
    };
    const MockESConstructor = vi.fn(() => mockEventSource);
    vi.stubGlobal("EventSource", MockESConstructor);

    waitForCompletion({
      baseUrl: "https://api.tinify.ai",
      jobId: "job-abc",
      timeoutMs: 60000,
    });

    // Second arg is the eventsource options (undefined when no auth headers).
    expect(MockESConstructor).toHaveBeenCalledWith(
      "https://api.tinify.ai/status/job-abc/stream",
      undefined
    );
  });

  it("rejects on timeout", async () => {
    vi.useFakeTimers();

    const mockEventSource = {
      addEventListener: vi.fn(),
      close: vi.fn(),
    };

    vi.stubGlobal("EventSource", vi.fn(() => mockEventSource));

    const promise = waitForCompletion({
      baseUrl: "https://api.tinify.ai",
      jobId: "job-1",
      timeoutMs: 5000,
    });

    vi.advanceTimersByTime(5001);

    await expect(promise).rejects.toThrow("Processing timed out");

    vi.useRealTimers();
  });
});
