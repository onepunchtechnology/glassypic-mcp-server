import { describe, it, expect } from "vitest";
import { requestContext, getRequestAuthHeaders } from "../context.js";

describe("requestContext", () => {
  it("returns empty object when no context is set", () => {
    const headers = getRequestAuthHeaders();
    expect(headers).toEqual({});
  });

  it("returns auth headers within a context run", async () => {
    const headers = { Authorization: "Bearer eyJtest.token" };
    let captured: Record<string, string> = {};

    await requestContext.run({ authHeaders: headers, sessionId: "s1" }, async () => {
      captured = getRequestAuthHeaders();
    });

    expect(captured).toEqual(headers);
  });

  it("returns empty object after context run completes", async () => {
    await requestContext.run(
      { authHeaders: { Authorization: "Bearer test" }, sessionId: "s1" },
      async () => {}
    );
    expect(getRequestAuthHeaders()).toEqual({});
  });

  it("isolates context between concurrent runs", async () => {
    const results: string[] = [];

    await Promise.all([
      requestContext.run({ authHeaders: { Authorization: "Bearer token-A" }, sessionId: "sA" }, async () => {
        await new Promise(r => setTimeout(r, 10));
        results.push(getRequestAuthHeaders().Authorization ?? "none");
      }),
      requestContext.run({ authHeaders: { Authorization: "Bearer token-B" }, sessionId: "sB" }, async () => {
        await new Promise(r => setTimeout(r, 5));
        results.push(getRequestAuthHeaders().Authorization ?? "none");
      }),
    ]);

    expect(results).toContain("Bearer token-A");
    expect(results).toContain("Bearer token-B");
  });
});
