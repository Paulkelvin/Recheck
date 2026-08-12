import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { eq } from "drizzle-orm";
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

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Pay to start your Land Scam Check
      </h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        We&apos;ll take you to a secure Paystack checkout.
      </p>
      <PaymentStarter reportId={id} />
    </div>
  );
}
