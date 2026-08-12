import { redirect } from "next/navigation";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SurveyorDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/dashboard");
  }
  if (session.user.role !== "surveyor") {
    redirect("/");
  }

  const reports = await db
    .select()
    .from(landReports)
    .where(eq(landReports.assignedSurveyorId, session.user.id))
    .orderBy(desc(landReports.createdAt));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-foreground">My assignments</h1>
      <p className="mt-1 text-sm text-muted">
        Reports assigned to you. Fill in your findings — the buyer sees them once
        everything for their tier is complete.
      </p>

      {reports.length === 0 ? (
        <p className="mt-8 text-sm text-muted">Nothing assigned to you yet.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id}>
              <Link href={`/dashboard/${report.id}`}>
                <Card className="flex items-center justify-between transition-colors hover:bg-background">
                  <div>
                    <p className="font-medium text-foreground">
                      {report.state}, {report.lga}
                      {report.planNumber ? ` — plan ${report.planNumber}` : ""}
                    </p>
                    <p className="text-sm text-muted">
                      {new Date(report.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge tone="neutral">{report.status.replace("_", " ")}</Badge>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
