import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { surveyorChecks } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";

// Tier 1 surveyor verification. MVP ships manual-entry only (method: "manual");
// Playwright automation gets layered in later per the build order, and even then
// runs as a rate-limited internal job, not something triggered live per request.
export async function POST(req: NextRequest) {
  try {
    await requireRole("buyer", "surveyor", "admin");

    const body = await req.json();
    const { surveyorName, regNumber } = body as {
      surveyorName?: string;
      regNumber?: string;
    };

    if (!surveyorName) {
      return NextResponse.json({ error: "surveyorName is required" }, { status: 400 });
    }

    const [check] = await db
      .insert(surveyorChecks)
      .values({
        surveyorName,
        regNumber,
        method: "manual",
      })
      .returning();

    return NextResponse.json({ checkId: check.id, status: "pending" });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
