import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { landReports, reportFindings, findingCheckTypeEnum, users } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";
import { REPORT_TIERS } from "@/lib/report-tiers";
import { sendWhatsAppTemplate } from "@/lib/whatsapp";
import { sendSms } from "@/lib/sms";

const ALL_CHECK_TYPES = findingCheckTypeEnum.enumValues;
const ALL_RESULTS = ["pass", "fail", "flagged", "inconclusive"] as const;

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
    const isAssignedSurveyor = user.role === "surveyor" && report.assignedSurveyorId === user.id;

    if (user.role !== "admin" && !isOwner && !isAssignedSurveyor) {
      return NextResponse.json({ error: "Not authorized for this action" }, { status: 403 });
    }

    // Buyers only see the report once it's paid for and finished; admins and
    // the assigned surveyor can see in-progress findings while working it.
    if (isOwner && user.role === "buyer" && (report.paymentStatus !== "paid" || report.status !== "ready")) {
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

// Admin OR the surveyor/lawyer assigned to this report fills in one finding
// at a time (in /admin/reports/:id or /dashboard/:id respectively). Once
// every check type has a result, the parent report flips to "ready"
// automatically.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole("admin", "surveyor");
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
    // Unvalidated, this reaches the column's enum and comes back as a 500
    // instead of a useful error.
    if (result !== undefined && !ALL_RESULTS.includes(result)) {
      return NextResponse.json(
        { error: `result must be one of: ${ALL_RESULTS.join(", ")}` },
        { status: 400 },
      );
    }

    const [report] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (user.role === "surveyor" && report.assignedSurveyorId !== user.id) {
      return NextResponse.json({ error: "Not authorized for this action" }, { status: 403 });
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

    const requiredCheckTypes = REPORT_TIERS[report.tier].checkTypes;
    const allFilled = requiredCheckTypes.every((type) =>
      allFindings.some((f) => f.checkType === type && f.result !== null),
    );

    if (allFilled && report.status !== "ready") {
      await db
        .update(landReports)
        .set({ status: "ready", updatedAt: new Date() })
        .where(eq(landReports.id, id));

      const [buyer] = await db.select().from(users).where(eq(users.id, report.userId)).limit(1);
      if (buyer?.phone) {
        const statusUrl = `${req.nextUrl.origin}/check/${id}/status`;
        const templateName = process.env.WHATSAPP_TEMPLATE_REPORT_READY;

        const whatsappResult = templateName
          ? await sendWhatsAppTemplate(buyer.phone, templateName, [buyer.name, statusUrl])
          : { sent: false, reason: "not_configured" as const };

        // SMS is the backup channel -- only used if WhatsApp didn't actually
        // send (not configured, invalid number, or a delivery failure).
        if (!whatsappResult.sent) {
          await sendSms(
            buyer.phone,
            `Hi ${buyer.name}, your Recheck report is ready: ${statusUrl}`,
          );
        }
      }
    }

    return NextResponse.json({ findings: allFindings, reportReady: allFilled });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
