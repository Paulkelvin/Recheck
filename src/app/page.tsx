import { REPORT_TIERS, CHECK_LABELS, CHECK_ORDER } from "@/lib/report-tiers";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 py-20 text-center">
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
            Before you pay for land
          </span>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Don&apos;t find out it was fake after you&apos;ve paid.
          </h1>
          <p className="max-w-xl text-lg text-muted">
            Make sure the plan is real, the land isn&apos;t already sold to
            someone else, and the government can&apos;t take it back —
            before you hand over your money.
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
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHECK_ORDER.map((type, i) => (
            <Card key={type} className="flex flex-col gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-background text-sm font-semibold text-brand">
                {i + 1}
              </span>
              <p className="font-medium text-foreground">{CHECK_LABELS[type]}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto w-full max-w-5xl px-6 py-16">
          <h2 className="text-center text-2xl font-semibold text-foreground">
            Pick your level of certainty
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            <Card className="flex flex-col gap-3">
              <p className="text-lg font-semibold text-foreground">
                {REPORT_TIERS.quick.label}
              </p>
              <p className="text-3xl font-semibold text-foreground">
                ₦{(REPORT_TIERS.quick.priceKobo / 100).toLocaleString()}
              </p>
              <p className="text-sm text-muted">{REPORT_TIERS.quick.description}</p>
            </Card>
            <Card className="flex flex-col gap-3 border-brand">
              <p className="text-lg font-semibold text-foreground">
                {REPORT_TIERS.full.label}
              </p>
              <p className="text-3xl font-semibold text-foreground">
                ₦{(REPORT_TIERS.full.priceKobo / 100).toLocaleString()}
              </p>
              <p className="text-sm text-muted">{REPORT_TIERS.full.description}</p>
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
