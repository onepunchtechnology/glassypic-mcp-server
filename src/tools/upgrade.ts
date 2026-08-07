import { openBrowser } from "../utils/browser.js";

const BILLING_URL = "https://glassypic.com/pricing";

export async function upgradeTool(): Promise<string> {
  const opened = await openBrowser(BILLING_URL);

  if (opened) {
    return "Opened the GlassyPic billing page in your browser.";
  }

  return `Open this URL to manage your GlassyPic plan: ${BILLING_URL}`;
}
