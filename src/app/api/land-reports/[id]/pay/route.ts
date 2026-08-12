import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { requireRole, AccessError } from "@/lib/access-control";
import { REPORT_PRICE_KOBO } from "@/lib/pricing";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole();
    const { id } = await params;

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: "Payments are not configured yet" }, { status: 503 });
    }

    const [report] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (report.userId !== user.id) {
      return NextResponse.json({ error: "Not authorized for this action" }, { status: 403 });
    }
    if (report.paymentStatus === "paid") {
      return NextResponse.json({ error: "This report is already paid for" }, { status: 400 });
    }

    const origin = req.nextUrl.origin;
    const reference = `${id}-${Date.now()}`;

    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: user.email,
        amount: REPORT_PRICE_KOBO,
        reference,
        callback_url: `${origin}/api/land-reports/${id}/payment-callback`,
        metadata: { landReportId: id, userId: user.id },
      }),
    });

    const data = await paystackRes.json();

    if (!paystackRes.ok || !data.status) {
      return NextResponse.json(
        { error: data.message || "Could not start payment" },
        { status: 502 },
      );
    }

    return NextResponse.json({ authorizationUrl: data.data.authorization_url });
  } catch (err) {
    if (err instanceof AccessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
