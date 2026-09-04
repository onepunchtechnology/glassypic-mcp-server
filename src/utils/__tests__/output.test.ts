import { describe, it, expect, vi, afterEach } from "vitest";
import { resolveOutputPath, resolveUniqueOutputPath } from "../output.js";
import * as fs from "node:fs";

describe("resolveOutputPath", () => {
  it("saves next to original with polished suffix", () => {
    expect(
      resolveOutputPath({
        inputPath: "/Users/me/img/hero.png",
        isUrl: false,
        filename: "hero.png",
        outputPath: undefined,
        outputFormat: undefined,
      })
    ).toBe("/Users/me/img/hero.polished.png");
  });

  it("uses new extension on format change", () => {
    expect(
      resolveOutputPath({
        inputPath: "/Users/me/img/hero.png",
        isUrl: false,
        filename: "hero.png",
        outputPath: undefined,
        outputFormat: "webp",
      })
    ).toBe("/Users/me/img/hero.polished.webp");
  });

  it("uses explicit output path as-is", () => {
    expect(
      resolveOutputPath({
        inputPath: "/Users/me/img/hero.png",
        isUrl: false,
        filename: "hero.png",
        outputPath: "/Users/me/dist/hero.webp",
        outputFormat: "webp",
      })
    ).toBe("/Users/me/dist/hero.webp");
  });

  it("appends polished filename to directory output_path", () => {
    expect(
      resolveOutputPath({
        inputPath: "/Users/me/img/hero.png",
        isUrl: false,
        filename: "hero.png",
        outputPath: "/Users/me/dist/",
        outputFormat: undefined,
      })
    ).toBe("/Users/me/dist/hero.polished.png");
  });

  it("saves URL input to CWD with polished suffix", () => {
    expect(
      resolveOutputPath({
        inputPath: "https://cdn.example.com/photo.jpg",
        isUrl: true,
        filename: "photo.jpg",
        outputPath: undefined,
        outputFormat: undefined,
        cwd: "/Users/me/project",
      })
    ).toBe("/Users/me/project/photo.polished.jpg");
  });

  it("saves URL to output directory with polished suffix", () => {
    expect(
      resolveOutputPath({
        inputPath: "https://cdn.example.com/photo.jpg",
        isUrl: true,
        filename: "photo.jpg",
        outputPath: "/Users/me/assets/",
        outputFormat: undefined,
      })
    ).toBe("/Users/me/assets/photo.polished.jpg");
  });

  it("handles URL with format conversion", () => {
    expect(
      resolveOutputPath({
        inputPath: "https://cdn.example.com/photo.jpg",
        isUrl: true,
        filename: "photo.jpg",
        outputPath: undefined,
        outputFormat: "webp",
        cwd: "/Users/me/project",
      })
    ).toBe("/Users/me/project/photo.polished.webp");
  });

  it("uses fallback filename for URLs without clear name", () => {
    expect(
      resolveOutputPath({
        inputPath: "https://api.example.com/image?id=123",
        isUrl: true,
        filename: "image",
        outputPath: undefined,
        outputFormat: "png",
        cwd: "/Users/me/project",
      })
    ).toBe("/Users/me/project/image.polished.png");
  });

  it("treats 'original' format as keeping input extension", () => {
    expect(
      resolveOutputPath({
        inputPath: "/Users/me/hero.png",
        isUrl: false,
        filename: "hero.png",
        outputPath: undefined,
        outputFormat: "original",
      })
    ).toBe("/Users/me/hero.polished.png");
  });

  describe("seoFilename", () => {
    it("uses SEO filename instead of polished suffix when provided", () => {
      expect(
        resolveOutputPath({
          inputPath: "/Users/me/img/hero.png",
          isUrl: false,
          filename: "hero.png",
          outputPath: undefined,
          outputFormat: undefined,
          seoFilename: "minato-arisato-persona-3",
        })
      ).toBe("/Users/me/img/minato-arisato-persona-3.png");
    });

    it("combines SEO filename with format conversion extension", () => {
      expect(
        resolveOutputPath({
          inputPath: "/Users/me/img/hero.png",
          isUrl: false,
          filename: "hero.png",
          outputPath: undefined,
          outputFormat: "webp",
          seoFilename: "scenic-mountain-view",
        })
      ).toBe("/Users/me/img/scenic-mountain-view.webp");
    });

    it("uses SEO filename inside directory output_path", () => {
      expect(
        resolveOutputPath({
          inputPath: "/Users/me/img/hero.png",
          isUrl: false,
          filename: "hero.png",
          outputPath: "/Users/me/dist/",
          outputFormat: undefined,
          seoFilename: "hero-mountain-view",
        })
      ).toBe("/Users/me/dist/hero-mountain-view.png");
    });

    it("explicit non-directory output_path always wins — SEO filename ignored", () => {
      expect(
        resolveOutputPath({
          inputPath: "/Users/me/img/hero.png",
          isUrl: false,
          filename: "hero.png",
          outputPath: "/tmp/custom.png",
          outputFormat: undefined,
          seoFilename: "some-seo-slug",
        })
      ).toBe("/tmp/custom.png");
    });

    it("uses SEO filename for URL input saved to CWD", () => {
      expect(
        resolveOutputPath({
          inputPath: "https://cdn.example.com/photo.jpg",
          isUrl: true,
          filename: "photo.jpg",
          outputPath: undefined,
          outputFormat: undefined,
          seoFilename: "product-photo-lifestyle",
          cwd: "/Users/me/project",
        })
      ).toBe("/Users/me/project/product-photo-lifestyle.jpg");
    });
  });
});

vi.mock("node:fs");

describe("resolveUniqueOutputPath", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns original path when no collision", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const result = resolveUniqueOutputPath({
      inputPath: "/Users/me/img/hero.png",
      isUrl: false,
      filename: "hero.png",
      outputPath: undefined,
      outputFormat: undefined,
      seoFilename: "scenic-mountain-view-a3f2",
    });
    expect(result).toBe("/Users/me/img/scenic-mountain-view-a3f2.png");
  });

  it("appends -2 when file already exists", () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === "/Users/me/img/scenic-mountain-view-a3f2.png");
    const result = resolveUniqueOutputPath({
      inputPath: "/Users/me/img/hero.png",
      isUrl: false,
      filename: "hero.png",
      outputPath: undefined,
      outputFormat: undefined,
      seoFilename: "scenic-mountain-view-a3f2",
    });
    expect(result).toBe("/Users/me/img/scenic-mountain-view-a3f2-2.png");
  });

  it("increments counter until unique path found", () => {
    const existing = new Set([
      "/Users/me/img/scenic-mountain-view-a3f2.png",
      "/Users/me/img/scenic-mountain-view-a3f2-2.png",
      "/Users/me/img/scenic-mountain-view-a3f2-3.png",
    ]);
    vi.mocked(fs.existsSync).mockImplementation((p) => existing.has(p as string));
    const result = resolveUniqueOutputPath({
      inputPath: "/Users/me/img/hero.png",
      isUrl: false,
      filename: "hero.png",
      outputPath: undefined,
      outputFormat: undefined,
      seoFilename: "scenic-mountain-view-a3f2",
    });
    expect(result).toBe("/Users/me/img/scenic-mountain-view-a3f2-4.png");
  });

  it("handles polished filenames (non-SEO) with collisions", () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => p === "/Users/me/img/hero.polished.png");
    const result = resolveUniqueOutputPath({
      inputPath: "/Users/me/img/hero.png",
      isUrl: false,
      filename: "hero.png",
      outputPath: undefined,
      outputFormat: undefined,
    });
    expect(result).toBe("/Users/me/img/hero.polished-2.png");
  });
});
