import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { surveyorChecks, surveyorScanLog } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";
import { scrapeSurconStatus } from "@/lib/surcon-scraper";

export const runtime = "nodejs";
// A single SURCON lookup (page load + fill + submit + wait) takes a few
// seconds; give it headroom above Vercel's 10s default without needing a
// paid plan (Hobby allows configuring this up to 60s).
export const maxDuration = 60;

// Admin clicks "Run automated check" in /admin/surveyor-checks -> this runs
// one Playwright lookup synchronously, right in this request, and returns
// the result immediately. No queue, no background worker, no separate host
// to keep running -- deliberately simple for admin-triggered, low-volume use.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
    const { id } = await params;

    const [check] = await db.select().from(surveyorChecks).where(eq(surveyorChecks.id, id)).limit(1);
    if (!check) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (check.status) {
      return NextResponse.json({ error: "This check already has a result" }, { status: 400 });
    }

    const searchTerm = check.regNumber || check.surveyorName;

    try {
      const result = await scrapeSurconStatus(searchTerm);

      const [updated] = await db
        .update(surveyorChecks)
        .set({ status: result.status, rawResult: result.rawResult, method: "automated", checkedAt: new Date() })
        .where(eq(surveyorChecks.id, id))
        .returning();

      await db.insert(surveyorScanLog).values({ surveyorCheckId: id, success: true });

      return NextResponse.json({ success: true, result: updated });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Falls back to manual, exactly as if the check had been queued
      // manual-entry to begin with -- the admin just fills in the form.
      await db.update(surveyorChecks).set({ method: "manual" }).where(eq(surveyorChecks.id, id));
      await db.insert(surveyorScanLog).values({ surveyorCheckId: id, success: false, errorMessage: message });

      return NextResponse.json({ success: false, error: message }, { status: 502 });
    }
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
