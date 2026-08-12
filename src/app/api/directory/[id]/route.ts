import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { surveyorsDirectory } from "@/db/schema";
import { auth } from "@/auth";
import { requireRole, AccessError } from "@/lib/access-control";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  const [listing] = await db
    .select()
    .from(surveyorsDirectory)
    .where(eq(surveyorsDirectory.id, id))
    .limit(1);

  if (!listing || (!isAdmin && listing.listingStatus !== "active")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ listing });
}

// Admin activates a pending signup (optionally after linking a Tier 1
// surveyor_checks result) or edits an existing listing.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireRole("admin");
    const { id } = await params;

    const body = await req.json();
    const { listingStatus, surconVerified } = body as {
      listingStatus?: "active" | "pending";
      surconVerified?: boolean;
    };

    const [updated] = await db
      .update(surveyorsDirectory)
      .set({
        ...(listingStatus ? { listingStatus } : {}),
        ...(surconVerified !== undefined
          ? { surconVerified, verifiedAt: surconVerified ? new Date() : null }
          : {}),
      })
      .where(eq(surveyorsDirectory.id, id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ listing: updated });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
