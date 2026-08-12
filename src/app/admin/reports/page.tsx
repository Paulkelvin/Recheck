import { redirect } from "next/navigation";
import Link from "next/link";
import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { landReports } from "@/db/schema";

export default async function AdminReportsPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/reports");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  const reports = await db.select().from(landReports).orderBy(desc(landReports.createdAt));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Land Scam Check reports
      </h1>

      {reports.length === 0 ? (
        <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
          No reports submitted yet.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {reports.map((report) => (
            <li key={report.id}>
              <Link
                href={`/admin/reports/${report.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <div>
                  <p className="font-medium text-black dark:text-zinc-50">
                    {report.state}, {report.lga}
                    {report.planNumber ? ` — plan ${report.planNumber}` : ""}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {report.paymentStatus === "paid" ? "Paid" : "Unpaid"} ·{" "}
                    {new Date(report.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {report.status.replace("_", " ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
