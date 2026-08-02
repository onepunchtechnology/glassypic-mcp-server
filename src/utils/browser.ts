import { execFile } from "node:child_process";

/**
 * Hosts we are willing to hand to the user's default browser.
 *
 * The authorize URL originates server-side as `${settings.web_url}/mcp/authorize`
 * (services/api/app/services/mcp_auth.py:46), so a protocol-only allowlist would
 * still open https://evil.example/harvest if that value were ever wrong. This
 * list is what actually closes that path.
 *
 * tinify.ai is retained because the pre-rename authorize URL may still be served
 * during migration. Drop it once settings.web_url is glassypic.com everywhere.
 */
const OWNED_HOSTS = ["glassypic.com", "tinify.ai"];

function isOwnedHost(hostname: string): boolean {
  return OWNED_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`));
}

function isLoopback(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * Opens a URL in the user's default browser.
 *
 * Uses execFile with an argv array rather than exec with an interpolated string,
 * so no shell parses the URL. Resolves false — without spawning anything — for
 * any URL that fails validation.
 *
 * @param allowLoopback Pass true only when the resolved API base URL is itself
 *   loopback, so local development keeps working without weakening the default.
 */
export function openBrowser(url: string, allowLoopback = false): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Promise.resolve(false);
  }

  const loopbackOk = allowLoopback && isLoopback(parsed.hostname);
  if (parsed.protocol !== "https:" && !(loopbackOk && parsed.protocol === "http:")) {
    return Promise.resolve(false);
  }
  if (!isOwnedHost(parsed.hostname) && !loopbackOk) {
    return Promise.resolve(false);
  }

  // `start` is a cmd.exe builtin, not an executable, so execFile("start", ...)
  // fails outright. Routing through `cmd /c start` would reintroduce shell
  // parsing and undo the reason for using execFile at all.
  const [cmd, args]: [string, string[]] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];

  return new Promise((resolve) => execFile(cmd, args, (error) => resolve(!error)));
}
