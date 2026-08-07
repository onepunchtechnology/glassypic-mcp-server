import { openBrowser } from "../utils/browser.js";

const PRICING_URL = "https://glassypic.com/pricing";

export async function upgradeTool(): Promise<string> {
  const opened = await openBrowser(PRICING_URL);

  if (opened) {
    return "Opened the GlassyPic pricing page in your browser.";
  }

  return `Open this URL to see GlassyPic plans: ${PRICING_URL}`;
}
