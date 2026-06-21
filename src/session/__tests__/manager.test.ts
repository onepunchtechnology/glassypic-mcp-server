import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { SessionManager } from "../manager.js";

describe("SessionManager", () => {
  let tmpDir: string;
  let manager: SessionManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinify-test-"));
    manager = new SessionManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no session exists", () => {
    expect(manager.getToken()).toBeNull();
  });

  it("saves and retrieves a session token", () => {
    manager.saveToken("test-token-123");
    expect(manager.getToken()).toBe("test-token-123");
  });

  it("persists token to disk", () => {
    manager.saveToken("persist-token");
    const newManager = new SessionManager(tmpDir);
    expect(newManager.getToken()).toBe("persist-token");
  });

  it("overwrites existing token", () => {
    manager.saveToken("old-token");
    manager.saveToken("new-token");
    expect(manager.getToken()).toBe("new-token");
  });

  it("handles corrupted session file gracefully", () => {
    const sessionFile = path.join(tmpDir, "session.json");
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(sessionFile, "not-json{{{");
    expect(manager.getToken()).toBeNull();
  });

  it("uses ~/.glassypic as default directory", () => {
    const defaultManager = new SessionManager();
    const expectedDir = path.join(os.homedir(), ".glassypic");
    expect(defaultManager.sessionDir).toBe(expectedDir);
  });
});

describe("legacy ~/.tinify migration (rename landmine)", () => {
  let tmpHome: string;
  let origHome: string | undefined;
  let origUserProfile: string | undefined;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "glassypic-home-"));
    // os.homedir() respects $HOME (POSIX) / %USERPROFILE% (Windows); point both at
    // a temp home so the default-mode SessionManager resolves into it.
    origHome = process.env.HOME;
    origUserProfile = process.env.USERPROFILE;
    process.env.HOME = tmpHome;
    process.env.USERPROFILE = tmpHome;
  });

  afterEach(() => {
    if (origHome === undefined) delete process.env.HOME;
    else process.env.HOME = origHome;
    if (origUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = origUserProfile;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function writeLegacy(data: object) {
    const dir = path.join(tmpHome, ".tinify");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "session.json"), JSON.stringify(data));
  }

  it("reads a legacy ~/.tinify session when ~/.glassypic does not exist", () => {
    writeLegacy({ session_token: "legacy_guest", mcp_token: "mcp_legacy" });
    const mgr = new SessionManager(); // default mode → ~/.glassypic + legacy fallback
    expect(mgr.getToken()).toBe("legacy_guest");
    expect(mgr.getMcpToken()).toBe("mcp_legacy");
  });

  it("migrates the legacy session into ~/.glassypic and removes the old file", () => {
    writeLegacy({ session_token: "legacy_guest" });
    const legacyFile = path.join(tmpHome, ".tinify", "session.json");

    new SessionManager().getToken(); // first read triggers the one-time migration

    expect(fs.existsSync(path.join(tmpHome, ".glassypic", "session.json"))).toBe(true);
    expect(fs.existsSync(legacyFile)).toBe(false);
  });

  it("prefers ~/.glassypic over the legacy file when both exist", () => {
    writeLegacy({ session_token: "legacy" });
    const newDir = path.join(tmpHome, ".glassypic");
    fs.mkdirSync(newDir, { recursive: true });
    fs.writeFileSync(path.join(newDir, "session.json"), JSON.stringify({ session_token: "current" }));

    expect(new SessionManager().getToken()).toBe("current");
  });

  it("does not use the legacy fallback when a custom sessionDir is injected", () => {
    writeLegacy({ session_token: "legacy_guest" });
    const customDir = fs.mkdtempSync(path.join(os.tmpdir(), "glassypic-custom-"));
    try {
      expect(new SessionManager(customDir).getToken()).toBeNull();
    } finally {
      fs.rmSync(customDir, { recursive: true, force: true });
    }
  });

  it("treats an explicit empty-string sessionDir as custom mode (no legacy migration)", () => {
    writeLegacy({ session_token: "legacy_guest" });
    // "" is an explicit dir, not default mode — must NOT migrate the real legacy
    // session forward (which would also write it to a relative ./session.json).
    expect(new SessionManager("").getToken()).toBeNull();
  });
});

describe("mcp_token", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tinify-test-mcp-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null mcpToken when not set", () => {
    const mgr = new SessionManager(tmpDir);
    mgr.saveToken("guest_abc");
    expect(mgr.getMcpToken()).toBeNull();
  });

  it("saves and retrieves mcp_token", () => {
    const mgr = new SessionManager(tmpDir);
    mgr.saveMcpToken("mcp_abc123", "user@email.com", "pro");
    expect(mgr.getMcpToken()).toBe("mcp_abc123");
  });

  it("preserves session_token when saving mcp_token", () => {
    const mgr = new SessionManager(tmpDir);
    mgr.saveToken("guest_abc");
    mgr.saveMcpToken("mcp_abc123", "user@email.com", "pro");
    expect(mgr.getToken()).toBe("guest_abc");
    expect(mgr.getMcpToken()).toBe("mcp_abc123");
  });

  it("clears mcp_token on clearMcpToken", () => {
    const mgr = new SessionManager(tmpDir);
    mgr.saveToken("guest_abc");
    mgr.saveMcpToken("mcp_abc123", "user@email.com", "pro");
    mgr.clearMcpToken();
    expect(mgr.getMcpToken()).toBeNull();
    expect(mgr.getToken()).toBe("guest_abc");
  });

  it("getAuthHeaders returns Bearer for mcp_token", () => {
    const mgr = new SessionManager(tmpDir);
    mgr.saveMcpToken("mcp_abc123", "user@email.com", "pro");
    const headers = mgr.getAuthHeaders();
    expect(headers).toEqual({ Authorization: "Bearer mcp_abc123" });
  });

  it("getAuthHeaders returns X-Session-Token for guest", () => {
    const mgr = new SessionManager(tmpDir);
    mgr.saveToken("guest_abc");
    const headers = mgr.getAuthHeaders();
    expect(headers).toEqual({ "X-Session-Token": "guest_abc" });
  });

  it("getAuthHeaders returns empty object when no tokens", () => {
    const mgr = new SessionManager(tmpDir);
    const headers = mgr.getAuthHeaders();
    expect(headers).toEqual({});
  });
});
