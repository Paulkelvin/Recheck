import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landReports, reportFindings, findingCheckTypeEnum } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";

const ALL_CHECK_TYPES = findingCheckTypeEnum.enumValues;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole();
    const { id } = await params;

    const [report] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isOwner = report.userId === user.id;
    if (user.role !== "admin" && !isOwner) {
      return NextResponse.json({ error: "Not authorized for this action" }, { status: 403 });
    }

    // Buyers only see the report once it's paid for and finished; admins can
    // see in-progress findings while working the queue.
    if (user.role !== "admin" && (report.paymentStatus !== "paid" || report.status !== "ready")) {
      return NextResponse.json({ error: "Report is not ready yet" }, { status: 403 });
    }

    const findings = await db
      .select()
      .from(reportFindings)
      .where(eq(reportFindings.landReportId, id));

    return NextResponse.json({ findings });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

// Admin fills in one finding at a time (surveyor/admin working the queue in
// /admin/reports/:id). Once every check type has a result, the parent report
// flips to "ready" automatically.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
    const { id } = await params;

    const body = await req.json();
    const { checkType, result, notes, evidenceUrl } = body as {
      checkType?: (typeof ALL_CHECK_TYPES)[number];
      result?: "pass" | "fail" | "flagged" | "inconclusive";
      notes?: string;
      evidenceUrl?: string;
    };

    if (!checkType || !ALL_CHECK_TYPES.includes(checkType)) {
      return NextResponse.json({ error: "Valid checkType is required" }, { status: 400 });
    }

    const [report] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [existing] = await db
      .select()
      .from(reportFindings)
      .where(and(eq(reportFindings.landReportId, id), eq(reportFindings.checkType, checkType)))
      .limit(1);

    if (existing) {
      await db
        .update(reportFindings)
        .set({ result, notes, evidenceUrl })
        .where(eq(reportFindings.id, existing.id));
    } else {
      await db.insert(reportFindings).values({
        landReportId: id,
        checkType,
        result,
        notes,
        evidenceUrl,
      });
    }

    const allFindings = await db
      .select()
      .from(reportFindings)
      .where(eq(reportFindings.landReportId, id));

    const allFilled = ALL_CHECK_TYPES.every((type) =>
      allFindings.some((f) => f.checkType === type && f.result !== null),
    );

    if (allFilled && report.status !== "ready") {
      await db
        .update(landReports)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(landReports.id, id));
      // TODO: trigger email/SMS notification to the buyer once a provider is wired up.
    }

    return NextResponse.json({ findings: allFindings, reportReady: allFilled });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
