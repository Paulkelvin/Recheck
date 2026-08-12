import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { LinkButton } from "@/components/ui/button";

const STEPS = [
  { key: "submitted", label: "Submitted" },
  { key: "under_review", label: "Under review" },
  { key: "surveyor_assigned", label: "Surveyor assigned" },
  { key: "ready", label: "Ready" },
] as const;

export default async function StatusPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
}) {
  const { id } = await params;
  const { payment } = await searchParams;
  const session = await auth();

  if (!session?.user) {
    redirect(`/login?callbackUrl=/check/${id}/status`);
  }

  const [report] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);

  if (!report || (report.userId !== session.user.id && session.user.role !== "admin")) {
    redirect("/check");
  }

  const currentIndex = STEPS.findIndex((s) => s.key === report.status);

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-foreground">Your Land Scam Check</h1>

      {payment === "success" && (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          Payment received — we&apos;re on it.
        </p>
      )}
      {payment === "failed" && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          We couldn&apos;t confirm your payment.{" "}
          <LinkButton href={`/check/${id}/payment`} variant="ghost" size="sm" className="h-auto p-0 underline">
            Try again
          </LinkButton>
          .
        </p>
      )}

      {report.paymentStatus !== "paid" && (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          This check hasn&apos;t been paid for yet.{" "}
          <a href={`/check/${id}/payment`} className="underline">
            Complete payment
          </a>
          .
        </p>
      )}

      <ol className="mt-8 flex flex-col gap-4">
        {STEPS.map((step, i) => {
          const reached = i <= currentIndex;
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                  reached
                    ? "bg-brand text-brand-foreground"
                    : "border border-border text-muted"
                }`}
              >
                {i + 1}
              </span>
              <span className={reached ? "font-medium text-foreground" : "text-muted"}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {report.status === "ready" && (
        <LinkButton href={`/check/${id}/report`} size="lg" className="mt-8">
          View your report
        </LinkButton>
      )}
    </div>
  );
}
