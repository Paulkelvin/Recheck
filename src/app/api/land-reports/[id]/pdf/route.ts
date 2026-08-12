import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { landReports, reportFindings } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";
import { renderReportPdf } from "@/lib/report-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    if (user.role !== "admin" && (report.paymentStatus !== "paid" || report.status !== "ready")) {
      return NextResponse.json({ error: "Report is not ready yet" }, { status: 403 });
    }

    const findings = await db
      .select()
      .from(reportFindings)
      .where(eq(reportFindings.landReportId, id));

    const pdf = await renderReportPdf(report, findings);

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="land-scam-check-${id}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
