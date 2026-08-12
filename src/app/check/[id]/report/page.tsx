import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { landReports, reportFindings } from "@/db/schema";
import { REPORT_TIERS, CHECK_LABELS, CHECK_ORDER, RESULT_LABELS, FindingResult } from "@/lib/report-tiers";

const RESULT_CLASSNAMES: Record<FindingResult, string> = {
  pass: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  fail: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  flagged: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  inconclusive: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
};

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/login?callbackUrl=/check/${id}/report`);
  }

  const [report] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);

  if (!report || (report.userId !== session.user.id && session.user.role !== "admin")) {
    redirect("/check");
  }

  if (report.paymentStatus !== "paid" || report.status !== "ready") {
    redirect(`/check/${id}/status`);
  }

  const findings = await db
    .select()
    .from(reportFindings)
    .where(eq(reportFindings.landReportId, id));

  const findingsByType = new Map(findings.map((f) => [f.checkType, f]));
  const requiredCheckTypes = REPORT_TIERS[report.tier].checkTypes;
  const checksToShow = CHECK_ORDER.filter((type) => requiredCheckTypes.includes(type));

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Your Land Scam Check report
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {report.state}, {report.lga}
        {report.planNumber ? ` — plan ${report.planNumber}` : ""} ·{" "}
        {REPORT_TIERS[report.tier].label}
      </p>

      <ul className="mt-8 flex flex-col gap-4">
        {checksToShow.map((type) => {
          const finding = findingsByType.get(type);

          return (
            <li
              key={type}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-black dark:text-zinc-50">
                  {CHECK_LABELS[type]}
                </p>
                {finding?.result && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${RESULT_CLASSNAMES[finding.result]}`}
                  >
                    {RESULT_LABELS[finding.result]}
                  </span>
                )}
              </div>
              {finding?.notes && (
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  {finding.notes}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <a
        href={`/api/land-reports/${id}/pdf`}
        className="mt-6 inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 px-5 text-sm font-medium text-black transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
      >
        Download PDF
      </a>
    </div>
  );
}
