import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildAuthHeaders } from "../client.js";

describe("buildAuthHeaders", () => {
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalUserProfile: string | undefined;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "glassypic-client-auth-"));
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

  function writeLocalSession(data: Record<string, string>) {
    const sessionDir = path.join(tmpHome, ".glassypic");
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, "session.json"), JSON.stringify(data));
  }

  it("uses the explicit token when provided", () => {
    expect(buildAuthHeaders("guest_abc")).toEqual({ "X-Session-Token": "guest_abc" });
  });

  it("uses the explicit token instead of a present local session", () => {
    writeLocalSession({ session_token: "guest_local", mcp_token: "mcp_local" });

    expect(buildAuthHeaders("guest_workspace")).toEqual({ "X-Session-Token": "guest_workspace" });
  });

  it("throws on a blank explicit token instead of falling back to local session", () => {
    writeLocalSession({ session_token: "guest_local", mcp_token: "mcp_local" });

    expect(() => buildAuthHeaders("")).toThrow("Explicit auth token must not be blank.");
    expect(() => buildAuthHeaders("   ")).toThrow("Explicit auth token must not be blank.");
  });

  it("falls back to local getAuthHeaders when no token", () => {
    expect(buildAuthHeaders()).toEqual({});
  });
});
