import { chromium } from "playwright-core";

export type SurconScrapeResult = {
  status: "registered" | "not_found" | "suspended";
  rawResult: string;
};

export class SurconNotConfiguredError extends Error {
  constructor() {
    super(
      "SURCON scraper selectors are not configured. Set SURCON_SEARCH_URL, " +
        "SURCON_NAME_INPUT_SELECTOR, SURCON_SUBMIT_SELECTOR and " +
        "SURCON_RESULT_SELECTOR after manually reviewing the site's markup.",
    );
  }
}

/**
 * Runs a single SURCON lookup with Playwright. Selectors are read from env
 * so this repo never hardcodes anything about a real site's DOM -- fill
 * them in only after a human has manually reviewed the page (SURCON's
 * robots.txt disallows bots; this stays a low-volume, admin-triggered,
 * rate-limited action per the design spec, never a per-request scrape).
 *
 * Throws on any failure (selector missing, timeout, CAPTCHA, config
 * missing) -- callers should catch this and fall back to method: "manual".
 */
export async function scrapeSurconStatus(
  searchTerm: string,
): Promise<SurconScrapeResult> {
  const searchUrl = process.env.SURCON_SEARCH_URL;
  const nameInputSelector = process.env.SURCON_NAME_INPUT_SELECTOR;
  const submitSelector = process.env.SURCON_SUBMIT_SELECTOR;
  const resultSelector = process.env.SURCON_RESULT_SELECTOR;

  if (!searchUrl || !nameInputSelector || !submitSelector || !resultSelector) {
    throw new SurconNotConfiguredError();
  }

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.fill(nameInputSelector, searchTerm);
    await page.click(submitSelector);
    await page.waitForSelector(resultSelector, { timeout: 15_000 });

    const rawResult = (await page.textContent(resultSelector))?.trim() ?? "";

    if (!rawResult) {
      throw new Error("SURCON result element was empty");
    }

    const status = classifyResult(rawResult);
    return { status, rawResult };
  } finally {
    await browser.close();
  }
}

/**
 * Vercel's serverless functions don't ship a browser binary, so in
 * production we pull in @sparticuz/chromium -- a Chromium build packaged
 * specifically to run inside AWS Lambda/Vercel-style functions. Locally (or
 * on any host with its own Chromium install), set PLAYWRIGHT_CHROMIUM_PATH
 * to skip that and point straight at it instead.
 */
async function launchBrowser() {
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

function classifyResult(rawResult: string): SurconScrapeResult["status"] {
  const lower = rawResult.toLowerCase();
  if (lower.includes("not found") || lower.includes("no record")) return "not_found";
  if (lower.includes("suspend") || lower.includes("revoked")) return "suspended";
  return "registered";
}
