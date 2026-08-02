import { openBrowser } from "../utils/browser.js";

const PRICING_URL = "https://glassypic.com/pricing";

export async function upgradeTool(): Promise<string> {
  const opened = await openBrowser(PRICING_URL);

  if (opened) {
    return "Opened pricing page in browser. Plans: Free (30/day), Pro (3,300/month), Max (12,000/month).";
  }

  return `Open this URL to see pricing: ${PRICING_URL}\nPlans: Free (30/day), Pro (3,300/month), Max (12,000/month).`;
}
