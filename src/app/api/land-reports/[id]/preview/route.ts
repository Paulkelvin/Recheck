import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";
import { extractPlanPreview } from "@/lib/plan-ocr";

async function loadReportForUser(id: string, user: { id: string; role: string }) {
  const [report] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);
  if (!report) return null;
  if (user.role !== "admin" && report.userId !== user.id) return undefined;
  return report;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole();
    const { id } = await params;
    const report = await loadReportForUser(id, user);

    if (report === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (report === undefined) {
      return NextResponse.json({ error: "Not authorized for this action" }, { status: 403 });
    }

    return NextResponse.json({
      status: report.planPreviewStatus,
      reason: report.planPreviewReason,
      note: report.planPreviewNote,
      coordinates: report.planPreviewCoordinates,
    });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

// Runs the fully-automatic OCR -> coordinate-conversion pipeline for a
// report's first uploaded document and stores the result. No admin review
// step -- extractPlanPreview() only ever returns "available" when its own
// plausibility checks pass, so there's nothing left for a human to gate.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole();
    const { id } = await params;
    const report = await loadReportForUser(id, user);

    if (report === null) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (report === undefined) {
      return NextResponse.json({ error: "Not authorized for this action" }, { status: 403 });
    }

    // Admin-only diagnostics: ?force=1 re-runs the pipeline even if it's
    // already settled, ?debug=1 includes the raw OCR words/parsed legs in
    // the response so a bad parse can be diagnosed without guessing.
    const url = new URL(req.url);
    const force = user.role === "admin" && url.searchParams.get("force") === "1";
    const debug = user.role === "admin" && url.searchParams.get("debug") === "1";

    const docUrl = report.uploadedDocs[0];
    if (!docUrl) {
      await db
        .update(landReports)
        .set({
          planPreviewStatus: "unavailable",
          planPreviewReason: "no_document",
          planPreviewCheckedAt: new Date(),
        })
        .where(eq(landReports.id, id));
      return NextResponse.json({ status: "unavailable", reason: "no_document" });
    }

    // Claim the job atomically. Vision API calls cost money and the client
    // can legitimately trigger this from more than one place (the intake
    // form fires it, and the preview card re-fires it for reports that
    // never got one -- re-checks, or a failed fire-and-forget), so a
    // read-then-write guard would let two callers both start the same run.
    // Only the caller that actually flips not_attempted -> processing
    // proceeds; everyone else just reports current state.
    const [claimed] = await db
      .update(landReports)
      .set({ planPreviewStatus: "processing" })
      .where(
        force
          ? eq(landReports.id, id)
          : and(eq(landReports.id, id), eq(landReports.planPreviewStatus, "not_attempted")),
      )
      .returning();

    if (!claimed) {
      return NextResponse.json({
        status: report.planPreviewStatus,
        reason: report.planPreviewReason,
        note: report.planPreviewNote,
      });
    }

    // Anything unexpected past this point has to land the row in a terminal
    // state before returning -- a row stuck on "processing" would leave the
    // client polling for a result that is never coming.
    try {
      const result = await extractPlanPreview(docUrl, report.state, debug);

      if (result.status === "available") {
        await db
          .update(landReports)
          .set({
            planPreviewStatus: "available",
            planPreviewCoordinates: result.coordinates,
            planPreviewReason: null,
            planPreviewNote: result.note ?? null,
            planPreviewCheckedAt: new Date(),
          })
          .where(eq(landReports.id, id));
        return NextResponse.json({
          status: "available",
          coordinates: result.coordinates,
          note: result.note ?? null,
          ...(debug ? { debug: result.debug } : {}),
        });
      }

      await db
        .update(landReports)
        .set({
          planPreviewStatus: "unavailable",
          planPreviewReason: result.reason,
          planPreviewNote: result.note ?? null,
          planPreviewCheckedAt: new Date(),
        })
        .where(eq(landReports.id, id));
      return NextResponse.json({
        status: "unavailable",
        reason: result.reason,
        note: result.note ?? null,
        ...(debug ? { debug: result.debug } : {}),
      });
    } catch (err) {
      console.error("[preview] extraction failed unexpectedly:", err);
      await db
        .update(landReports)
        .set({
          planPreviewStatus: "unavailable",
          planPreviewReason: "unexpected_error",
          planPreviewCheckedAt: new Date(),
        })
        .where(eq(landReports.id, id));
      return NextResponse.json({ status: "unavailable", reason: "unexpected_error" });
    }
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
