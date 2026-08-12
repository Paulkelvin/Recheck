import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { surveyorChecks } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("buyer", "surveyor", "admin");

    const { id } = await params;
    const [check] = await db
      .select()
      .from(surveyorChecks)
      .where(eq(surveyorChecks.id, id))
      .limit(1);

    if (!check) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const status = check.status ?? "pending";

    return NextResponse.json({
      status,
      result: {
        surveyorName: check.surveyorName,
        regNumber: check.regNumber,
        method: check.method,
        rawResult: check.rawResult,
        checkedAt: check.checkedAt,
      },
    });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
