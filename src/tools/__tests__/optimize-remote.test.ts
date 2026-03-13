import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("optimize_image in remote mode", () => {
  beforeEach(() => {
    process.env.MCP_TRANSPORT = "http";
  });
  afterEach(() => {
    delete process.env.MCP_TRANSPORT;
  });

  it("rejects local file paths in HTTP mode", async () => {
    const { resolveInput } = await import("../optimize.js");
    expect(() => resolveInput("/Users/test/image.png")).toThrow(
      /local file paths are not supported/i
    );
  });

  it("accepts URLs in HTTP mode", async () => {
    const { resolveInput } = await import("../optimize.js");
    expect(() => resolveInput("https://example.com/image.png")).not.toThrow();
  });
});
