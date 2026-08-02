import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { resolveInput, isUrl } from "../input.js";

describe("isUrl", () => {
  it("detects http URLs", () => {
    expect(isUrl("http://example.com/image.png")).toBe(true);
  });

  it("detects https URLs", () => {
    expect(isUrl("https://cdn.example.com/photo.jpg")).toBe(true);
  });

  it("rejects local file paths", () => {
    expect(isUrl("/Users/me/image.png")).toBe(false);
    expect(isUrl("./relative/image.png")).toBe(false);
    expect(isUrl("image.png")).toBe(false);
  });
});

describe("resolveInput", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinify-input-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads a local file and returns buffer + filename", async () => {
    const filePath = path.join(tmpDir, "hero.png");
    fs.writeFileSync(filePath, "fake-png-data");

    const result = await resolveInput(filePath);
    expect(result.buffer.toString()).toBe("fake-png-data");
    expect(result.filename).toBe("hero.png");
    expect(result.isUrl).toBe(false);
  });

  it("throws on non-existent file", async () => {
    await expect(resolveInput("/nonexistent/path.png")).rejects.toThrow(
      "File not found"
    );
  });
});
