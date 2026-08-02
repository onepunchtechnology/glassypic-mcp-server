import { describe, it, expect } from "vitest";
import { resolveApiBaseUrl } from "../client.js";

describe("resolveApiBaseUrl", () => {
  it("accepts the production https URL", () => {
    const result = resolveApiBaseUrl({ GLASSYPIC_API_URL: "https://api.glassypic.com" });
    expect(result.baseUrl).toBe("https://api.glassypic.com");
    expect(result.isLoopback).toBe(false);
  });

  it("accepts http for localhost", () => {
    const result = resolveApiBaseUrl({ GLASSYPIC_API_URL: "http://localhost:8000" });
    expect(result.baseUrl).toBe("http://localhost:8000");
    expect(result.isLoopback).toBe(true);
  });

  it("accepts http for 127.0.0.1", () => {
    expect(resolveApiBaseUrl({ GLASSYPIC_API_URL: "http://127.0.0.1:8000" }).isLoopback).toBe(true);
  });

  it("rejects plaintext http for a remote host", () => {
    expect(() => resolveApiBaseUrl({ GLASSYPIC_API_URL: "http://api.example.com" })).toThrow(
      /GLASSYPIC_API_URL/,
    );
  });

  it("rejects a malformed value and names the variable", () => {
    expect(() => resolveApiBaseUrl({ GLASSYPIC_API_URL: "not-a-url" })).toThrow(
      /GLASSYPIC_API_URL/,
    );
  });

  it("prefers GLASSYPIC_API_URL over TINIFY_API_URL", () => {
    const result = resolveApiBaseUrl({
      GLASSYPIC_API_URL: "https://api.glassypic.com",
      TINIFY_API_URL: "https://api.tinify.ai",
    });
    expect(result.baseUrl).toBe("https://api.glassypic.com");
  });

  it("falls back to TINIFY_API_URL when GLASSYPIC_API_URL is unset", () => {
    expect(resolveApiBaseUrl({ TINIFY_API_URL: "https://api.tinify.ai" }).baseUrl).toBe(
      "https://api.tinify.ai",
    );
  });

  it("falls back to the default when neither is set", () => {
    expect(resolveApiBaseUrl({}).baseUrl).toBe("https://api.glassypic.com");
  });

  it("strips a trailing slash so path joins stay well-formed", () => {
    expect(resolveApiBaseUrl({ GLASSYPIC_API_URL: "https://api.glassypic.com/" }).baseUrl).toBe(
      "https://api.glassypic.com",
    );
  });

  it("names TINIFY_API_URL in error when only TINIFY_API_URL is bad", () => {
    expect(() => resolveApiBaseUrl({ TINIFY_API_URL: "not-a-url" })).toThrow(
      /TINIFY_API_URL/,
    );
  });

  it("names GLASSYPIC_API_URL in error when it is bad, even if TINIFY_API_URL is also set", () => {
    expect(() =>
      resolveApiBaseUrl({
        GLASSYPIC_API_URL: "not-a-url",
        TINIFY_API_URL: "https://api.tinify.ai",
      }),
    ).toThrow(/GLASSYPIC_API_URL/);
  });
});
