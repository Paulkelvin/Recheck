import { SurveyorChecksClient } from "./surveyor-checks-client";

export default function SurveyorChecksPage() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-foreground">Surveyor checks</h1>
      <p className="mt-1 text-sm text-muted">
        Internal ops tool. SURCON lookups are manual-entry only until the automated
        check is configured.
      </p>

      <SurveyorChecksClient />
    </div>
  );
}
