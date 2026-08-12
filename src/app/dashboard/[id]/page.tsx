import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { landReports, reportFindings } from "@/db/schema";
import { REPORT_TIERS } from "@/lib/report-tiers";
import { FindingsForm } from "@/components/findings-form";

export default async function SurveyorReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/login?callbackUrl=/dashboard/${id}`);
  }
  if (session.user.role !== "surveyor") {
    redirect("/");
  }

  const [report] = await db.select().from(landReports).where(eq(landReports.id, id)).limit(1);

  if (!report || report.assignedSurveyorId !== session.user.id) {
    redirect("/dashboard");
  }

  const findings = await db
    .select()
    .from(reportFindings)
    .where(eq(reportFindings.landReportId, id));

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-foreground">
        {report.state}, {report.lga}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {report.planNumber && `Plan: ${report.planNumber} · `}
        {report.sellerName && `Seller: ${report.sellerName} · `}
        {REPORT_TIERS[report.tier].label}
      </p>

      {report.address && <p className="mt-2 text-sm text-muted">{report.address}</p>}

      {report.uploadedDocs.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-foreground">Documents</p>
          <ul className="mt-1 flex flex-col gap-1">
            {report.uploadedDocs.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-brand underline"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <FindingsForm
        reportId={id}
        checkTypes={REPORT_TIERS[report.tier].checkTypes}
        initialFindings={findings.map((f) => ({
          checkType: f.checkType,
          result: f.result,
          notes: f.notes,
        }))}
      />
    </div>
  );
}
