import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";
import { isReportTier } from "@/lib/report-tiers";

export async function GET() {
  try {
    const user = await requireRole();

    let reports;
    if (user.role === "admin") {
      reports = await db.select().from(landReports).orderBy(desc(landReports.createdAt));
    } else if (user.role === "surveyor") {
      reports = await db
        .select()
        .from(landReports)
        .where(eq(landReports.assignedSurveyorId, user.id))
        .orderBy(desc(landReports.createdAt));
    } else {
      reports = await db
        .select()
        .from(landReports)
        .where(eq(landReports.userId, user.id))
        .orderBy(desc(landReports.createdAt));
    }

    return NextResponse.json({ reports });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole();

    const body = await req.json();
    const { state, lga, address, planNumber, sellerName, uploadedDocs, tier } = body as {
      state?: string;
      lga?: string;
      address?: string;
      planNumber?: string;
      sellerName?: string;
      uploadedDocs?: string[];
      tier?: string;
    };

    if (!state || !lga) {
      return NextResponse.json({ error: "state and lga are required" }, { status: 400 });
    }
    if (tier !== undefined && !isReportTier(tier)) {
      return NextResponse.json({ error: "tier must be 'quick' or 'full'" }, { status: 400 });
    }

    const [report] = await db
      .insert(landReports)
      .values({
        userId: user.id,
        state,
        lga,
        address,
        planNumber,
        sellerName,
        uploadedDocs: uploadedDocs ?? [],
        ...(tier ? { tier } : {}),
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
