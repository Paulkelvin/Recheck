import { chromium } from "playwright";

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

  // Some hosts (e.g. this repo's dev container) ship a pre-installed
  // Chromium at a fixed path rather than the revision Playwright expects by
  // default; point at it explicitly when set instead of `npx playwright install`.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ headless: true, executablePath });

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

function classifyResult(rawResult: string): SurconScrapeResult["status"] {
  const lower = rawResult.toLowerCase();
  if (lower.includes("not found") || lower.includes("no record")) return "not_found";
  if (lower.includes("suspend") || lower.includes("revoked")) return "suspended";
  return "registered";
}
