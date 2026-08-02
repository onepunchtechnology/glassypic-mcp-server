import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { CREDIT_COSTS, SVG_ICO_FLAT_COST, AUTO_UPSCALE_THRESHOLD, costSummary } from "../costs.js";

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CREDITS_PY = path.join(PKG_ROOT, "../../services/api/app/services/credits.py");
const CONFIG_PY = path.join(PKG_ROOT, "../../services/api/app/config.py");

/**
 * Parses the CREDIT_COSTS dict out of the backend source.
 *
 * It is a four-entry flat dict of integer literals (credits.py:13-18). Asserting
 * all four keys were found means a shape change fails loudly rather than
 * silently reading zero entries and passing.
 */
function parseBackendCreditCosts(source: string): Record<string, number> {
  const block = source.match(/CREDIT_COSTS\s*=\s*\{([\s\S]*?)\}/);
  if (!block) throw new Error("CREDIT_COSTS block not found in credits.py");

  const parsed: Record<string, number> = {};
  for (const entry of block[1].matchAll(/"([a-z_]+)"\s*:\s*(\d+)/g)) {
    parsed[entry[1]] = Number(entry[2]);
  }
  return parsed;
}

/**
 * Parses `auto_upscale_threshold: float = 1.2` out of config.py (config.py:98).
 * Fails loudly (rather than silently matching nothing) if the declaration's
 * shape ever changes.
 */
function parseBackendAutoUpscaleThreshold(source: string): number {
  const match = source.match(/auto_upscale_threshold\s*:\s*float\s*=\s*([0-9.]+)/);
  if (!match) throw new Error("auto_upscale_threshold declaration not found in config.py");
  return Number(match[1]);
}

describe("cost contract", () => {
  // Skips in the public mirror, which is a git subtree of packages/mcp-server
  // and has no services/api. The release-time diff in DEPLOYMENT.md 5b is the
  // enforcement layer that survives there.
  it.skipIf(!fs.existsSync(CREDITS_PY))(
    "matches the backend CREDIT_COSTS schedule",
    () => {
      const backend = parseBackendCreditCosts(fs.readFileSync(CREDITS_PY, "utf8"));

      expect(Object.keys(backend).sort()).toEqual(["compress", "resize", "tag", "upscale"]);
      expect(backend).toEqual({ ...CREDIT_COSTS });
    },
  );

  // Skips in the public mirror, same reasoning as the CREDIT_COSTS check above.
  it.skipIf(!fs.existsSync(CONFIG_PY))(
    "matches the backend auto_upscale_threshold",
    () => {
      const backendThreshold = parseBackendAutoUpscaleThreshold(fs.readFileSync(CONFIG_PY, "utf8"));
      expect(AUTO_UPSCALE_THRESHOLD).toBe(backendThreshold);
    },
  );

  it("states the full-pipeline cost", () => {
    const full = CREDIT_COSTS.compress + CREDIT_COSTS.resize + CREDIT_COSTS.upscale + CREDIT_COSTS.tag;
    expect(full).toBe(7);
    expect(costSummary()).toContain("7");
  });

  it("states the resize-only cost including the auto-upscale surcharge", () => {
    const resizeOnly =
      CREDIT_COSTS.compress + CREDIT_COSTS.resize + CREDIT_COSTS.tag + CREDIT_COSTS.upscale;
    expect(resizeOnly).toBe(7);
    expect(costSummary()).toMatch(/auto|1\.2/i);
  });

  it("states the SVG/ICO flat override", () => {
    expect(SVG_ICO_FLAT_COST).toBe(1);
    expect(costSummary()).toMatch(/SVG/);
  });

  it("no longer advertises a flat 3-credit call", () => {
    expect(costSummary()).not.toMatch(/Each call costs 3 credits/);
  });
});
