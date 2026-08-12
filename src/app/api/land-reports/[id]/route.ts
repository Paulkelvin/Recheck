import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";

async function loadReportForUser(id: string, user: { id: string; role: string }) {
  const [report] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);

  if (!report) return null;

  const isOwner = report.userId === user.id;
  const isAssignedSurveyor = user.role === "surveyor" && report.assignedSurveyorId === user.id;

  if (user.role !== "admin" && !isOwner && !isAssignedSurveyor) return undefined;

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

    if (report === null) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (report === undefined) {
      return NextResponse.json({ error: "Not authorized for this action" }, { status: 403 });
    }

    return NextResponse.json({ report });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

// Admin-only: assign a partner surveyor and/or move the report through its
// workflow (submitted -> under_review -> surveyor_assigned). "ready" is set
// automatically once every finding is filled in (see the findings route).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
    const { id } = await params;

    const body = await req.json();
    const { status, assignedSurveyorId } = body as {
      status?: "submitted" | "under_review" | "surveyor_assigned";
      assignedSurveyorId?: string | null;
    };

    const [updated] = await db
      .update(landReports)
      .set({
        ...(status ? { status } : {}),
        ...(assignedSurveyorId !== undefined ? { assignedSurveyorId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(landReports.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ report: updated });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
