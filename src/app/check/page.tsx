import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { IntakeForm } from "./intake-form";

export default async function CheckPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/check");
  }

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Check my land
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Tell us about the land and upload what you have. We&apos;ll check
        it&apos;s not fake, not already sold, and not something the
        government can take back.
      </p>

      <IntakeForm />
    </div>
  );
}
