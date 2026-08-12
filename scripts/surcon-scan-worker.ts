import "dotenv/config";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { surveyorChecks, surveyorScanLog } from "../src/db/schema";
import { scrapeSurconStatus } from "../src/lib/surcon-scraper";

// Intended to run as its own small background process (a VPS/Railway
// service per the design spec), never on Vercel's serverless functions --
// long-running headless browser work doesn't fit there. Polls for
// method: "automated" checks with no result yet, processes ONE at a time,
// and sleeps between runs to keep SURCON lookups low-volume as required by
// the compliance notes in docs/design.md section 9.
const POLL_INTERVAL_MS = Number(process.env.SURCON_WORKER_POLL_MS ?? 10_000);
const MIN_GAP_BETWEEN_SCANS_MS = Number(process.env.SURCON_WORKER_MIN_GAP_MS ?? 5_000);

async function processNextCheck(): Promise<boolean> {
  const [check] = await db
    .select()
    .from(surveyorChecks)
    .where(and(eq(surveyorChecks.method, "automated"), isNull(surveyorChecks.status)))
    .orderBy(asc(surveyorChecks.createdAt))
    .limit(1);

  if (!check) return false;

  const searchTerm = check.regNumber || check.surveyorName;

  try {
    const result = await scrapeSurconStatus(searchTerm);

    await db
      .update(surveyorChecks)
      .set({ status: result.status, rawResult: result.rawResult, checkedAt: new Date() })
      .where(eq(surveyorChecks.id, check.id));

    await db.insert(surveyorScanLog).values({
      surveyorCheckId: check.id,
      success: true,
    });

    console.log(`[surcon-worker] resolved ${check.id} (${searchTerm}) -> ${result.status}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    // Falls back to manual per the design spec: an admin picks this up in
    // /admin/surveyor-checks exactly like any other pending check.
    await db
      .update(surveyorChecks)
      .set({ method: "manual" })
      .where(eq(surveyorChecks.id, check.id));

    await db.insert(surveyorScanLog).values({
      surveyorCheckId: check.id,
      success: false,
      errorMessage: message,
    });

    console.warn(`[surcon-worker] scrape failed for ${check.id}, flagged for manual review: ${message}`);
  }

  return true;
}

async function main() {
  console.log("[surcon-worker] starting, poll interval", POLL_INTERVAL_MS, "ms");

  while (true) {
    const processed = await processNextCheck();

    if (processed) {
      await sleep(MIN_GAP_BETWEEN_SCANS_MS);
    } else {
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
