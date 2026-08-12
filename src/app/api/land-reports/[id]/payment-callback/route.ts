import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { priceForReport } from "@/lib/report-tiers";

// Paystack redirects the buyer's browser here after checkout. We re-verify
// server-side against Paystack's API rather than trusting the redirect query
// params, since those are attacker-controllable.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const reference = req.nextUrl.searchParams.get("reference") ?? req.nextUrl.searchParams.get("trxref");
  const origin = req.nextUrl.origin;

  if (!reference) {
    return NextResponse.redirect(`${origin}/check/${id}/status?payment=failed`);
  }

  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.redirect(`${origin}/check/${id}/status?payment=failed`);
  }

  const [report] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);
  if (!report) {
    return NextResponse.redirect(`${origin}/check/${id}/status?payment=failed`);
  }

  const verifyRes = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );
  const data = await verifyRes.json();

  const verified =
    verifyRes.ok &&
    data.status &&
    data.data?.status === "success" &&
    data.data?.amount === priceForReport(report.tier, Boolean(report.previousReportId));

  if (!verified) {
    return NextResponse.redirect(`${origin}/check/${id}/status?payment=failed`);
  }

  await db
    .update(landReports)
    .set({
      paymentStatus: "paid",
      amountPaid: String(data.data.amount / 100),
      status: "under_review",
      updatedAt: new Date(),
    })
    .where(eq(landReports.id, id));

  return NextResponse.redirect(`${origin}/check/${id}/status?payment=success`);
}
