import { NextRequest, NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { surveyorsDirectory } from "@/db/schema";
import { auth } from "@/auth";

// Public listing: only active, verified-or-not listings show up. Admins get
// everything (including pending signups) so /admin/directory can review them.
export async function GET(req: NextRequest) {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  const state = req.nextUrl.searchParams.get("state");

  const conditions = [];
  if (!isAdmin) conditions.push(eq(surveyorsDirectory.listingStatus, "active"));
  if (state) conditions.push(eq(surveyorsDirectory.state, state));

  const listings = await db
    .select()
    .from(surveyorsDirectory)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(surveyorsDirectory.createdAt));

  return NextResponse.json({ listings });
}

// Public signup for /for-surveyors: creates a pending listing. Admin
// verifies (via a Tier 1 SURCON check) before it goes live in the directory.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, regNumber, firmName, state, city, phone, email } = body as {
    name?: string;
    regNumber?: string;
    firmName?: string;
    state?: string;
    city?: string;
    phone?: string;
    email?: string;
  };

  if (!name || !regNumber || !state) {
    return NextResponse.json(
      { error: "name, regNumber and state are required" },
      { status: 400 },
    );
  }

  const [listing] = await db
    .insert(surveyorsDirectory)
    .values({ name, regNumber, firmName, state, city, phone, email })
    .returning();

  return NextResponse.json({ listing });
}
