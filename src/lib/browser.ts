import { chromium } from "playwright-core";

/**
 * Vercel's serverless functions don't ship a browser binary, so in
 * production we pull in @sparticuz/chromium -- a Chromium build packaged
 * specifically to run inside AWS Lambda/Vercel-style functions. Locally (or
 * on any host with its own Chromium install), set PLAYWRIGHT_CHROMIUM_PATH
 * to skip that and point straight at it instead.
 */
export async function launchBrowser() {
  const overridePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (overridePath) {
    return chromium.launch({ headless: true, executablePath: overridePath });
  }

  const sparticuzChromium = (await import("@sparticuz/chromium")).default;
  const executablePath = await sparticuzChromium.executablePath();

  return chromium.launch({
    headless: true,
    executablePath,
    args: sparticuzChromium.args,
  });
}
