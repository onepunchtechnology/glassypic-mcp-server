/**
 * The package's credit vocabulary.
 *
 * SOURCE OF TRUTH: services/api/app/services/credits.py:13-18. These values are
 * a mirror, and src/__tests__/costs.test.ts fails if they drift from it when the
 * backend source is present. In the public mirror that test skips, so the
 * release-time diff in docs/DEPLOYMENT.md section 5b is the enforcement layer.
 *
 * Do not edit these numbers without changing the backend first.
 */
export const CREDIT_COSTS = {
  resize: 1,
  tag: 1,
  upscale: 2,
  compress: 3,
} as const;

/** SVG and ICO output is billed flat, overriding every other component. */
export const SVG_ICO_FLAT_COST = 1;

/** Matches the gif_frame_limit ceiling in the optimize_image schema. */
export const GIF_FRAME_LIMIT_MAX = 100;

/**
 * The auto-upscale trigger: whenever a resize target exceeds the source by
 * more than this factor, the server materializes an upscale on its own.
 *
 * SOURCE OF TRUTH: services/api/app/config.py:98 (`auto_upscale_threshold`).
 * src/__tests__/costs.test.ts fails if this drifts from it when the backend
 * source is present, mirroring the CREDIT_COSTS contract above. Do not edit
 * this number without changing the backend first.
 */
export const AUTO_UPSCALE_THRESHOLD = 1.2;

const FULL_PIPELINE =
  CREDIT_COSTS.compress + CREDIT_COSTS.resize + CREDIT_COSTS.upscale + CREDIT_COSTS.tag;

const GIF_WORST_CASE =
  (CREDIT_COSTS.resize + CREDIT_COSTS.upscale + CREDIT_COSTS.compress) * GIF_FRAME_LIMIT_MAX +
  CREDIT_COSTS.tag;

/**
 * The cost paragraph spliced into the optimize_image description.
 *
 * Generated rather than hand-written so the description cannot drift from
 * CREDIT_COSTS. The auto-upscale row is the one most likely to be missed: the
 * server materializes an upscale whenever a resize target exceeds the source by
 * more than AUTO_UPSCALE_THRESHOLD, with nothing in the request indicating why.
 */
export function costSummary(): string {
  return (
    `Credits: ${CREDIT_COSTS.compress} to compress (always), ` +
    `+${CREDIT_COSTS.resize} if width or height is set, ` +
    `+${CREDIT_COSTS.upscale} to upscale, ` +
    `+${CREDIT_COSTS.tag} for SEO tags (on by default). ` +
    `A full pipeline is ${FULL_PIPELINE} credits. ` +
    `Upscale is charged whether you request it or the server adds it automatically — ` +
    `it does so whenever a resize target exceeds the source by more than ${AUTO_UPSCALE_THRESHOLD}x, ` +
    `so a resize-only call on a small image also costs ${FULL_PIPELINE}. ` +
    `SVG or ICO output is a flat ${SVG_ICO_FLAT_COST} credit, overriding everything above. ` +
    `Animated GIFs are billed per frame: (per-frame operations x frames) + ${CREDIT_COSTS.tag} if tags, ` +
    `up to ${GIF_WORST_CASE} credits at the ${GIF_FRAME_LIMIT_MAX}-frame limit — ` +
    `confirm_gif_cost gates that path. GIFs are excluded from automatic upscaling.`
  );
}

export const UPSCALE_COST_NOTE =
  `Costs ${CREDIT_COSTS.upscale} credits. Note that upscaling also triggers automatically, ` +
  `without this parameter, whenever a resize target exceeds the source by more than ${AUTO_UPSCALE_THRESHOLD}x — ` +
  `the same ${CREDIT_COSTS.upscale} credits are charged either way.`;

export const RESIZE_COST_NOTE =
  `Costs ${CREDIT_COSTS.resize} credit. If the target exceeds the source by more than ${AUTO_UPSCALE_THRESHOLD}x, ` +
  `the server also adds an AI upscale for a further ${CREDIT_COSTS.upscale} credits.`;

export const SEO_COST_NOTE = `Costs ${CREDIT_COSTS.tag} extra credit. Default: true.`;
