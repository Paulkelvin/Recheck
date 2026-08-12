import { db } from "@/db";
import { landReports } from "@/db/schema";
import { Card } from "@/components/ui/card";

export default async function AdminStatsPage() {
  const reports = await db.select().from(landReports);

  const total = reports.length;
  const paid = reports.filter((r) => r.paymentStatus === "paid");
  const ready = reports.filter((r) => r.status === "ready");
  const revenue = paid.reduce((sum, r) => sum + Number(r.amountPaid ?? 0), 0);
  const conversionRate = total === 0 ? 0 : Math.round((paid.length / total) * 100);

  const byTier = {
    quick: reports.filter((r) => r.tier === "quick").length,
    full: reports.filter((r) => r.tier === "full").length,
  };

  const stats = [
    { label: "Total reports", value: total.toLocaleString() },
    { label: "Paid", value: paid.length.toLocaleString() },
    { label: "Ready", value: ready.length.toLocaleString() },
    { label: "Conversion rate", value: `${conversionRate}%` },
    { label: "Revenue", value: `₦${revenue.toLocaleString()}` },
    { label: "Quick vs Full", value: `${byTier.quick} / ${byTier.full}` },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-foreground">Stats</h1>
      <p className="mt-1 text-sm text-muted">
        A running snapshot of the business. Revenue reflects payments recorded in
        the app (including the Paystack bypass while payments aren&apos;t configured).
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-muted">{stat.label}</p>
            <p className="mt-1 text-2xl font-semibold text-foreground">{stat.value}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
