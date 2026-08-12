import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";

// Admin creates accounts for partner surveyors/lawyers. This is the only
// way "surveyor" role accounts get created -- there's no public signup for
// it, since these are vetted partners, not self-service.
export async function GET() {
  try {
    await requireRole("admin");

    const team = await db
      .select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.role, "surveyor"))
      .orderBy(desc(users.createdAt));

    return NextResponse.json({ team });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole("admin");

    const body = await req.json();
    const { name, email, password } = body as {
      name?: string;
      email?: string;
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

    const [member] = await db
      .insert(users)
      .values({ name, email, passwordHash, role: "surveyor" })
      .returning({ id: users.id, name: users.name, email: users.email });

    return NextResponse.json({ member });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
