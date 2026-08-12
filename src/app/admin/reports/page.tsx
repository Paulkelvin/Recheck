import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { landReports } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminReportsPage() {
  const reports = await db.select().from(landReports).orderBy(desc(landReports.createdAt));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-foreground">Recheck reports</h1>

      {reports.length === 0 ? (
        <p className="mt-6 text-sm text-muted">No reports submitted yet.</p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id}>
              <Link href={`/admin/reports/${report.id}`}>
                <Card className="flex items-center justify-between transition-colors hover:bg-background">
                  <div>
                    <p className="font-medium text-foreground">
                      {report.state}, {report.lga}
                      {report.planNumber ? ` — plan ${report.planNumber}` : ""}
                    </p>
                    <p className="text-sm text-muted">
                      {report.paymentStatus === "paid" ? "Paid" : "Unpaid"} ·{" "}
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
