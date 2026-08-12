import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { surveyorChecks } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";

export async function GET() {
  try {
    await requireRole("admin");

    const checks = await db
      .select()
      .from(surveyorChecks)
      .orderBy(desc(surveyorChecks.createdAt));

    return NextResponse.json({ checks });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

// Tier 1 surveyor verification is an internal ops tool, not a buyer-facing
// on-demand check (SURCON's robots.txt disallows automated access, and the
// design intentionally keeps lookups low-volume and admin-driven). Default
// is manual entry; requesting method: "automated" just queues the row for
// the rate-limited background worker (scripts/surcon-scan-worker.ts) to
// pick up -- it still falls back to manual on any scrape failure.
export async function POST(req: NextRequest) {
  try {
    await requireRole("admin");

    const body = await req.json();
    const { surveyorName, regNumber, method } = body as {
      surveyorName?: string;
      regNumber?: string;
      method?: "manual" | "automated";
    };

    if (!surveyorName) {
      return NextResponse.json({ error: "surveyorName is required" }, { status: 400 });
    }

    const [check] = await db
      .insert(surveyorChecks)
      .values({
        surveyorName,
        regNumber,
        method: method === "automated" ? "automated" : "manual",
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
