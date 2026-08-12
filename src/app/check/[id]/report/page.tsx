import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { landReports, reportFindings } from "@/db/schema";

const CHECK_LABELS: Record<string, string> = {
  plan_authenticity: "Is this survey plan real?",
  overlap: "Has this land been sold to someone else?",
  acquisition: "Can the government take this land back?",
  dispute: "Is anyone else claiming this land?",
  size: "Am I getting the size I'm paying for?",
  encumbrance: "Does this land have hidden debt or court cases?",
};

// Fixed display order regardless of what order findings were saved in.
const CHECK_ORDER = [
  "plan_authenticity",
  "overlap",
  "acquisition",
  "dispute",
  "size",
  "encumbrance",
] as const;

const RESULT_STYLES: Record<string, { label: string; className: string }> = {
  pass: {
    label: "Looks good",
    className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  },
  fail: {
    label: "Problem found",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
  flagged: {
    label: "Needs your attention",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  inconclusive: {
    label: "Couldn't confirm",
    className: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
  },
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

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Your Land Scam Check report
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {report.state}, {report.lga}
        {report.planNumber ? ` — plan ${report.planNumber}` : ""}
      </p>

      <ul className="mt-8 flex flex-col gap-4">
        {CHECK_ORDER.map((type) => {
          const finding = findingsByType.get(type);
          const style = finding?.result ? RESULT_STYLES[finding.result] : null;

          return (
            <li
              key={type}
              className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-black dark:text-zinc-50">
                  {CHECK_LABELS[type]}
                </p>
                {style && (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}>
                    {style.label}
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
    </div>
  );
}
