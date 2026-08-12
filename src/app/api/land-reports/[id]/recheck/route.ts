import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";

// Creates a fresh land_report pre-filled from a finished one, linked via
// previousReportId so /pay can apply the re-check discount. Land status
// changes over time, so this is a cheap way to re-verify without re-typing
// everything.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole();
    const { id } = await params;

    const [original] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);
    if (!original) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (original.userId !== user.id) {
      return NextResponse.json({ error: "Not authorized for this action" }, { status: 403 });
    }
    if (original.paymentStatus !== "paid" || original.status !== "ready") {
      return NextResponse.json(
        { error: "Only a finished report can be re-checked" },
        { status: 400 },
      );
    }

    const [report] = await db
      .insert(landReports)
      .values({
        userId: user.id,
        state: original.state,
        lga: original.lga,
        address: original.address,
        planNumber: original.planNumber,
        sellerName: original.sellerName,
        uploadedDocs: original.uploadedDocs,
        tier: original.tier,
        previousReportId: original.id,
      })
      .returning();

    return NextResponse.json({ report });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
