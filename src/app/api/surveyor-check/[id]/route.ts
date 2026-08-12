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
    await requireRole("admin");

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

// Manual-entry fallback: an admin fills in the result by hand after checking
// SURCON themselves, since Playwright automation isn't wired up yet (and even
// once it is, this stays the fallback path for scrape failures).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");

    const { id } = await params;
    const body = await req.json();
    const { status, rawResult } = body as {
      status?: "registered" | "not_found" | "suspended";
      rawResult?: string;
    };

    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    const [updated] = await db
      .update(surveyorChecks)
      .set({ status, rawResult, method: "manual", checkedAt: new Date() })
      .where(eq(surveyorChecks.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ status: updated.status, result: updated });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
