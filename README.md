# @tinify-ai/mcp-server

[![npm version](https://img.shields.io/npm/v/@tinify-ai/mcp-server.svg)](https://www.npmjs.com/package/@tinify-ai/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![MCP](https://img.shields.io/badge/MCP-Compatible-brightgreen.svg)](https://modelcontextprotocol.io)

MCP server for [tinify.ai](https://tinify.ai) image optimization. AI-powered upscaling, resizing/cropping, compression, and SEO filename & alt text generation — all in one tool.

## Quick Start

Add to your MCP client config:

```json
{
  "mcpServers": {
    "tinify": {
      "command": "npx",
      "args": ["-y", "@tinify-ai/mcp-server@latest"]
    }
  }
}
```

No signup required. Works out of the box with 20 free daily credits.

### Client-Specific Setup

<details>
<summary><strong>Claude Desktop</strong></summary>

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "tinify": {
      "command": "npx",
      "args": ["-y", "@tinify-ai/mcp-server@latest"]
    }
  }
}
```
</details>

<details>
<summary><strong>Claude Code</strong></summary>

```bash
claude mcp add tinify -- npx -y @tinify-ai/mcp-server@latest
```
</details>

<details>
<summary><strong>Cursor</strong></summary>

Add to `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "tinify": {
      "command": "npx",
      "args": ["-y", "@tinify-ai/mcp-server@latest"]
    }
  }
}
```
</details>

<details>
<summary><strong>Windsurf</strong></summary>

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "tinify": {
      "command": "npx",
      "args": ["-y", "@tinify-ai/mcp-server@latest"]
    }
  }
}
```
</details>

<details>
<summary><strong>Cline</strong></summary>

Open Cline settings → MCP Servers → Add, then paste:

```json
{
  "mcpServers": {
    "tinify": {
      "command": "npx",
      "args": ["-y", "@tinify-ai/mcp-server@latest"]
    }
  }
}
```
</details>

<details>
<summary><strong>Gemini CLI</strong></summary>

Edit `~/.gemini/settings.json` (global) or `.gemini/settings.json` in your project root:

```json
{
  "mcpServers": {
    "tinify": {
      "command": "npx",
      "args": ["-y", "@tinify-ai/mcp-server@latest"]
    }
  }
}
```
</details>

<details>
<summary><strong>OpenAI Codex CLI</strong></summary>

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.tinify]
command = "npx"
args = ["-y", "@tinify-ai/mcp-server@latest"]
```
</details>

## Tool: `optimize_image`

Optimizes an image with smart lossy compression (typically 60-80% size reduction), optional resize/upscale/format conversion, and AI-generated SEO metadata. Accepts absolute local file paths or remote URLs.

### Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | string | Yes | — | Absolute local file path or remote URL |
| `output_path` | string | No | auto | File path or directory (ending in `/`). If omitted: saves next to original with SEO slug or `.tinified` suffix |
| `output_format` | string | No | original | `jpg`, `png`, `webp`, `avif`, `gif`, or `original` |
| `output_width_px` | int | No | — | Target width in pixels |
| `output_height_px` | int | No | — | Target height in pixels |
| `output_upscale_factor` | int | No | — | AI upscale factor: `2` (2×) or `4` (4×) |
| `output_resize_behavior` | string | No | pad | `pad` (white padding) or `crop` (smart crop). Only used when both width and height are set |
| `output_seo_tag_gen` | bool | No | true | Generate SEO metadata and rename file to SEO slug. Costs 1 extra credit |
| `output_file_size_limit` | int | No | — | Target maximum output file size in bytes. Server attempts to meet this via additional compression. Not guaranteed |
| `gif_frame_limit` | int | No | 100 | Max frames to process for animated GIFs (1–100). Reduces credit cost by sampling fewer frames |
| `confirm_gif_cost` | bool | No | — | Set to `true` to proceed after reviewing the animated GIF cost warning. Required for animated GIFs |

### Resize Behavior

| Dimensions provided | Behavior | `output_resize_behavior` |
|---|---|---|
| Width only | Proportional scale | N/A |
| Height only | Proportional scale | N/A |
| Width + Height | Exact dimensions, white padding | `pad` (default) |
| Width + Height | Exact dimensions, smart crop | `crop` |

### Examples

**Basic compression** — just compress, keep format and dimensions:

```json
{ "input": "/Users/me/photos/hero.png" }
```

**Convert to WebP:**

```json
{ "input": "/Users/me/hero.png", "output_format": "webp" }
```

**Resize proportionally** — set one dimension, the other scales:

```json
{ "input": "/Users/me/hero.png", "output_width_px": 1200 }
```

**Exact dimensions with padding** — white bars fill the gap:

```json
{ "input": "/Users/me/hero.png", "output_width_px": 1080, "output_height_px": 1080 }
```

**Exact dimensions with smart crop:**

```json
{ "input": "/Users/me/hero.png", "output_width_px": 1080, "output_height_px": 1080, "output_resize_behavior": "crop" }
```

**AI upscale 4x:**

```json
{ "input": "/Users/me/icon.png", "output_upscale_factor": 4 }
```

**From URL, save to directory:**

```json
{ "input": "https://example.com/photo.jpg", "output_path": "/Users/me/assets/" }
```

**Skip SEO to save 1 credit:**

```json
{ "input": "/Users/me/hero.png", "output_seo_tag_gen": false }
```

### Output

Returns a text summary and structured metadata:

```
Optimized: /Users/me/photos/modern-office-workspace.webp
Size: 142.3 KB
Compression: 73%
Format: webp
Dimensions: 1920x1080
Alt text: Modern office workspace with laptop and coffee cup on wooden desk
```

**Structured output fields:**

```json
{
  "output_path": "/Users/me/photos/modern-office-workspace.webp",
  "output_size_bytes": 145715,
  "output_width_px": 1920,
  "output_height_px": 1080,
  "output_format": "webp",
  "compression_ratio": 0.27,
  "seo_alt_text": "Modern office workspace with laptop and coffee cup on wooden desk",
  "seo_keywords": ["office", "workspace", "laptop", "desk", "modern"],
  "seo_filename": "modern-office-workspace"
}
```

## Supported Formats

| Format | Input | Output | Notes |
|--------|-------|--------|-------|
| JPG | Yes | Yes | |
| PNG | Yes | Yes | |
| WebP | Yes | Yes | |
| AVIF | Yes | Yes | |
| GIF | Yes | Yes | Animated GIFs preserved when output is GIF |
| SVG | Yes | Yes | SVG→SVG optimized via SVGO; raster↔SVG conversion supported |
| ICO | Yes | Yes | Smart rebuild: generates 16, 24, 32, 48, 256px favicon set |
| HEIC/HEIF | Yes* | No | Auto-converted to JPG at upload |
| TIFF | Yes* | No | Auto-converted to JPG at upload |
| BMP | Yes* | No | Auto-converted to JPG at upload |

tinify.ai supports high-quality conversion between any input and output format combination.
Converting an animated GIF to a non-GIF format (JPG, PNG, WebP, AVIF) preserves only the first frame.
Converting an animated GIF to a GIF format supports upscaling/resizing while preserving the animation and quality. You may also reduce animated GIF file size by decreasing the number of output frames.

Max upload file size: 50 MB.

### SVG & ICO Examples

```
# Optimize an SVG file (keeps as vector)
Optimize logo.svg and keep it as SVG

# Convert SVG to raster
Convert icon.svg to a 512x512 PNG

# Trace raster to vector SVG
Convert my logo.png to a vector SVG

# Generate favicon set from any image
Convert logo.png to an ICO favicon

# Generate single-size ICO
Convert logo.png to a 32x32 ICO

# Extract largest icon from ICO
Convert favicon.ico to PNG
```

## How It Works

```
Local file or URL
  → Upload to Tinify.ai API
    → Smart compression (lossy, typically 60-80% reduction)
    → AI SEO tag generation (alt text, keywords, filename)
    → Optional: resize, upscale, format conversion
  → Download optimized file
    → Save with SEO filename slug (or .tinified suffix if SEO disabled)
```

All processing happens server-side via the [Tinify.ai API](https://api.tinify.ai). The MCP server is a thin client that orchestrates the pipeline.

## Credits

| | Guest | Free | Pro | Max |
|---|---|---|---|---|
| Credits/day or month | 20/day | 50/day | 3,000/month | 10,000/month |
| Images/day (default settings) | ~5 | ~12 | ~750 | ~2,500 |
| Cost per image | 3 credits + 1 SEO | same | same | same |
| Signup required | No | Free signup | Paid | Paid |

Session data is stored locally at `~/.tinify/session.json` and persists across invocations.

## Account & Credits

Log in to unlock more credits and share them across the web app and MCP server:

```
Use the login tool to sign in.
Use the status tool to check your current credits.
Use the upgrade tool to open the pricing page.
Use the logout tool to sign out.
```

### login

Opens a browser window to complete login (Google, Facebook, or email/magic link). After approval, your account is linked and credits are shared with the web app.

```
Login complete: user@example.com (Pro tier, 2,850 of 3,000 credits remaining)
```

### status

Check your current account status and credits before batch processing:

```
Logged in as user@example.com (Pro tier)
Credits: 2,850 of 3,000 remaining
Resets: 03/01/2026, 12:00 AM PST
```

### logout

Revokes the session and reverts to guest mode (20 credits/day).

### upgrade

Opens [tinify.ai/pricing](https://tinify.ai/pricing) in your browser.

## Tips for AI Agents

Paste this into your `CLAUDE.md` or system prompt to help agents use the tool effectively:

```
## Tinify.ai MCP

Tools: optimize_image, login, logout, status, upgrade

- Use status to check credits before batch processing
- Each optimize_image call costs 3 credits + 1 if SEO enabled (default)
- Guest: 20 credits/day. Free account: 50/day. Pro: 3,000/month.
- Always use absolute file paths, not relative.
- Set only width OR height for proportional resize. Set both for exact dimensions.
- When both dimensions are set, use output_resize_behavior: "crop" for photos, "pad" for logos/icons.
- output_seo_tag_gen (default true) renames the file to an SEO slug and generates alt text + keywords.
- Set output_seo_tag_gen: false to save 1 credit when SEO metadata is not needed.
- GIF is supported for both input and output; animated GIFs stay animated when output_format is "gif".
- Converting an animated GIF to jpg/png/webp/avif preserves only the first frame.
- HEIC, TIFF, BMP inputs are auto-converted to JPG.
- For batch processing, call optimize_image once per file.
- If credits run out, use login to sign in or upgrade to open pricing.
```

## Troubleshooting

**Server not appearing in tool list:**
- Restart your MCP client after editing the config
- Ensure Node.js >= 18 is installed: `node --version`
- Try running directly: `npx -y @tinify-ai/mcp-server@latest` (should start without errors)

**"Insufficient credits" error:**
- Use the `status` tool to check remaining credits
- Use the `login` tool to sign in for more credits (free accounts get 50/day)
- Use the `upgrade` tool to see paid plans (Pro: 3,000/month, Max: 10,000/month)
- Disable SEO tags (`output_seo_tag_gen: false`) to reduce cost to 3 credits/image

**Login browser window doesn't open:**
- Open this URL manually: `https://tinify.ai/mcp/authorize` and enter the code shown in the terminal
- Ensure a browser is installed and accessible

**Session token issues:**
- Session data is stored at `~/.tinify/session.json`
- Delete this file to reset and start fresh
- Use `logout` then `login` to re-authenticate

**File not found:**
- Use absolute paths for local files
- For URLs, ensure the image is publicly accessible

**Timeout errors:**
- Large images or AI upscaling can take 30-60 seconds
- The server has a 60-second timeout per job

## Requirements

- Node.js >= 18
- An MCP-compatible client (Claude Desktop, Claude Code, Cursor, Windsurf, Cline, etc.)

## License

MIT - see [LICENSE](LICENSE).
