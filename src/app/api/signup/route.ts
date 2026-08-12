import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

// Public signup, buyer role only. Surveyor/admin accounts are created out of
// band (surveyors go through /for-surveyors + admin verification; admins are
// seeded via scripts/seed-admin.ts) -- this endpoint can't grant either.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, phone, password } = body as {
    name?: string;
    email?: string;
    phone?: string;
    password?: string;
  };

  if (!name || !email || !password) {
    return NextResponse.json(
      { error: "name, email and password are required" },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 },
    );
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hash(password, 10);

  const [user] = await db
    .insert(users)
    .values({ name, email, phone, passwordHash, role: "buyer" })
    .returning();

  return NextResponse.json({ id: user.id, email: user.email });
}
