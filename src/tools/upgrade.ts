import { openBrowser } from "../utils/browser.js";

const PRICING_URL = "https://glassypic.com/pricing";

export async function upgradeTool(): Promise<string> {
  const opened = openBrowser(PRICING_URL);

  if (opened) {
    return "Opened pricing page in browser. Plans: Free (50/day), Pro (3,000/month), Max (10,000/month).";
  }

  return `Open this URL to see pricing: ${PRICING_URL}\nPlans: Free (50/day), Pro (3,000/month), Max (10,000/month).`;
}
