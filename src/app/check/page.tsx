import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { REPORT_TIERS } from "@/lib/report-tiers";
import { IntakeForm } from "./intake-form";

export default async function CheckPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/check");
  }

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-foreground">
        Check my land
      </h1>
      <p className="mt-1 text-sm text-muted">
        Tell us about the land and upload what you have. We&apos;ll check
        it&apos;s not fake, not already sold, and not something the
        government can take back.
      </p>

      <IntakeForm
        tiers={{
          quick: {
            label: REPORT_TIERS.quick.label,
            description: REPORT_TIERS.quick.description,
            priceNaira: REPORT_TIERS.quick.priceKobo / 100,
          },
          full: {
            label: REPORT_TIERS.full.label,
            description: REPORT_TIERS.full.description,
            priceNaira: REPORT_TIERS.full.priceKobo / 100,
          },
        }}
      />
    </div>
  );
}
