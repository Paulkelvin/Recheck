import Link from "next/link";
import {
  FileCheck2,
  Copy,
  Landmark,
  Scale,
  Ruler,
  Banknote,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import {
  REPORT_TIERS,
  CHECK_LABELS,
  CHECK_DESCRIPTIONS,
  CHECK_ORDER,
  type CheckType,
} from "@/lib/report-tiers";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const CHECK_ICONS: Record<CheckType, React.ComponentType<{ className?: string }>> = {
  plan_authenticity: FileCheck2,
  overlap: Copy,
  acquisition: Landmark,
  dispute: Scale,
  size: Ruler,
  encumbrance: Banknote,
};

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 py-20 text-center">
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            Before you pay for land
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            That plot could already be sold twice.
          </h1>
          <p className="max-w-md text-lg text-muted">
            Verify the plan, the seller, and the title — before you pay.
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="/check" size="lg">
              Check my land
            </LinkButton>
            <LinkButton href="/directory" variant="secondary" size="lg">
              Find a licensed surveyor
            </LinkButton>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold text-foreground">
          What we check
        </h2>
        <p className="mx-auto mt-2 max-w-md text-center text-muted">
          Six checks, done by real licensed surveyors and a lawyer — not an
          algorithm guessing.
        </p>
        <div className="mt-12 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {CHECK_ORDER.map((type) => {
            const Icon = CHECK_ICONS[type];
            return (
              <Link
                key={type}
                href="/check"
                className="group relative flex flex-col items-center rounded-2xl border border-border bg-surface px-6 pb-6 pt-10 text-center shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="absolute -top-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10 text-brand ring-4 ring-background">
                  <Icon className="h-6 w-6" />
                </span>
                <p className="font-semibold text-foreground">{CHECK_LABELS[type]}</p>
                <p className="mt-2 text-sm text-muted">{CHECK_DESCRIPTIONS[type]}</p>
                <span className="mt-4 flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted transition-colors group-hover:border-brand group-hover:text-brand">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold text-foreground">
            Pick your level of certainty
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <Card className="flex flex-col gap-4">
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {REPORT_TIERS.quick.label}
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground">
                  ₦{(REPORT_TIERS.quick.priceKobo / 100).toLocaleString()}
                </p>
              </div>
              <p className="text-sm text-muted">{REPORT_TIERS.quick.description}</p>
              <ul className="flex flex-col gap-2 text-sm text-foreground">
                {REPORT_TIERS.quick.checkTypes.map((type) => (
                  <li key={type} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    {CHECK_LABELS[type]}
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="relative flex flex-col gap-4 border-brand shadow-md">
              <Badge tone="info" className="absolute -top-3 left-5">
                Most popular
              </Badge>
              <div>
                <p className="text-lg font-semibold text-foreground">
                  {REPORT_TIERS.full.label}
                </p>
                <p className="mt-1 text-3xl font-semibold text-foreground">
                  ₦{(REPORT_TIERS.full.priceKobo / 100).toLocaleString()}
                </p>
              </div>
              <p className="text-sm text-muted">{REPORT_TIERS.full.description}</p>
              <ul className="flex flex-col gap-2 text-sm text-foreground">
                {REPORT_TIERS.full.checkTypes.map((type) => (
                  <li key={type} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    {CHECK_LABELS[type]}
                  </li>
                ))}
              </ul>
            </Card>
          </div>
          <div className="mt-8 flex justify-center">
            <LinkButton href="/check" size="lg">
              Start my check
            </LinkButton>
          </div>
        </div>
      </section>
    </div>
  );
}
