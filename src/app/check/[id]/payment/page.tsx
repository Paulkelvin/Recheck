import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { eq } from "drizzle-orm";
import { priceForReport } from "@/lib/report-tiers";
import { PaymentStarter } from "./payment-starter";

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/login?callbackUrl=/check/${id}/payment`);
  }

  const [report] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);

  if (!report || (report.userId !== session.user.id && session.user.role !== "admin")) {
    redirect("/check");
  }

  if (report.paymentStatus === "paid") {
    redirect(`/check/${id}/status`);
  }

  const isRecheck = Boolean(report.previousReportId);
  const priceNaira = priceForReport(report.tier, isRecheck) / 100;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold text-foreground">
        Pay to start your Recheck
      </h1>
      <p className="mt-2 text-2xl font-semibold text-foreground">
        ₦{priceNaira.toLocaleString()}
      </p>
      {isRecheck && (
        <p className="mt-1 text-sm text-emerald-700 dark:text-emerald-400">
          Re-check discount applied
        </p>
      )}
      <p className="mt-2 text-sm text-muted">
        We&apos;ll take you to a secure Paystack checkout.
      </p>
      <PaymentStarter reportId={id} />
    </div>
  );
}
