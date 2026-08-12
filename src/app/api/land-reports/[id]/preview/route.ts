import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
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

    if (report.planPreviewStatus !== "not_attempted") {
      return NextResponse.json({ status: report.planPreviewStatus });
    }

    const docUrl = report.uploadedDocs[0];
    if (!docUrl) {
      await db
        .update(landReports)
        .set({ planPreviewStatus: "unavailable", planPreviewReason: "no_document" })
        .where(eq(landReports.id, id));
      return NextResponse.json({ status: "unavailable", reason: "no_document" });
    }

    await db
      .update(landReports)
      .set({ planPreviewStatus: "processing" })
      .where(eq(landReports.id, id));

    const result = await extractPlanPreview(docUrl, report.state);

    if (result.status === "available") {
      await db
        .update(landReports)
        .set({
          planPreviewStatus: "available",
          planPreviewCoordinates: result.coordinates,
          planPreviewCheckedAt: new Date(),
        })
        .where(eq(landReports.id, id));
      return NextResponse.json({ status: "available", coordinates: result.coordinates });
    }

    await db
      .update(landReports)
      .set({
        planPreviewStatus: "unavailable",
        planPreviewReason: result.reason,
        planPreviewCheckedAt: new Date(),
      })
      .where(eq(landReports.id, id));
    return NextResponse.json({ status: "unavailable", reason: result.reason });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
