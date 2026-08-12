import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { landReports, reportFindings } from "@/db/schema";
import { REPORT_TIERS, RECHECK_DISCOUNT_PERCENT, CHECK_LABELS, CHECK_ORDER, RESULT_LABELS, FindingResult } from "@/lib/report-tiers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { RecheckButton } from "./recheck-button";

const RESULT_TONES: Record<FindingResult, "success" | "danger" | "warning" | "neutral"> = {
  pass: "success",
  fail: "danger",
  flagged: "warning",
  inconclusive: "neutral",
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
      <h1 className="text-2xl font-semibold text-foreground">
        Your Land Scam Check report
      </h1>
      <p className="mt-1 text-sm text-muted">
        {report.state}, {report.lga}
        {report.planNumber ? ` — plan ${report.planNumber}` : ""} ·{" "}
        {REPORT_TIERS[report.tier].label}
      </p>

      <ul className="mt-8 flex flex-col gap-4">
        {checksToShow.map((type) => {
          const finding = findingsByType.get(type);

          return (
            <li key={type}>
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-foreground">{CHECK_LABELS[type]}</p>
                  {finding?.result && (
                    <Badge tone={RESULT_TONES[finding.result]}>
                      {RESULT_LABELS[finding.result]}
                    </Badge>
                  )}
                </div>
                {finding?.notes && (
                  <p className="mt-2 text-sm text-muted">{finding.notes}</p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex flex-wrap gap-3">
        <LinkButton href={`/api/land-reports/${id}/pdf`} variant="secondary">
          Download PDF
        </LinkButton>
        <RecheckButton reportId={id} discountPercent={RECHECK_DISCOUNT_PERCENT} />
      </div>
    </div>
  );
}
