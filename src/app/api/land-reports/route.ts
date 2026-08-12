import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";

export async function GET() {
  try {
    const user = await requireRole();

    const reports =
      user.role === "admin"
        ? await db.select().from(landReports).orderBy(desc(landReports.createdAt))
        : await db
            .select()
            .from(landReports)
            .where(eq(landReports.userId, user.id))
            .orderBy(desc(landReports.createdAt));

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
    const { state, lga, address, planNumber, sellerName, uploadedDocs } = body as {
      state?: string;
      lga?: string;
      address?: string;
      planNumber?: string;
      sellerName?: string;
      uploadedDocs?: string[];
    };

    if (!state || !lga) {
      return NextResponse.json({ error: "state and lga are required" }, { status: 400 });
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
