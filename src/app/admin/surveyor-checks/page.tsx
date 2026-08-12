import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SurveyorChecksClient } from "./surveyor-checks-client";

export default async function SurveyorChecksPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/surveyor-checks");
  }

  if (session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Surveyor checks
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Internal ops tool. SURCON lookups are manual-entry only for now — no
        automated scraping runs against the live site yet.
      </p>

      <SurveyorChecksClient />
    </div>
  );
}
