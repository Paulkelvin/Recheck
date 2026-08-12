import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { surveyorsDirectory } from "@/db/schema";

export default async function SurveyorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [listing] = await db
    .select()
    .from(surveyorsDirectory)
    .where(eq(surveyorsDirectory.id, id))
    .limit(1);

  if (!listing || listing.listingStatus !== "active") {
    notFound();
  }

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          {listing.name}
        </h1>
        {listing.surconVerified && (
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
            SURCON Verified ✓
          </span>
        )}
      </div>

      {listing.firmName && (
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">{listing.firmName}</p>
      )}

      <dl className="mt-8 flex flex-col gap-3 text-sm">
        <div className="flex justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
          <dt className="text-zinc-500">Registration number</dt>
          <dd className="text-black dark:text-zinc-50">{listing.regNumber}</dd>
        </div>
        <div className="flex justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
          <dt className="text-zinc-500">State</dt>
          <dd className="text-black dark:text-zinc-50">
            {listing.city ? `${listing.city}, ` : ""}
            {listing.state}
          </dd>
        </div>
        {listing.phone && (
          <div className="flex justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
            <dt className="text-zinc-500">Phone</dt>
            <dd className="text-black dark:text-zinc-50">{listing.phone}</dd>
          </div>
        )}
        {listing.email && (
          <div className="flex justify-between border-b border-zinc-200 pb-2 dark:border-zinc-800">
            <dt className="text-zinc-500">Email</dt>
            <dd className="text-black dark:text-zinc-50">{listing.email}</dd>
          </div>
        )}
      </dl>

      {!listing.surconVerified && (
        <p className="mt-6 text-sm text-zinc-500">
          This listing hasn&apos;t been verified against SURCON&apos;s
          register yet.
        </p>
      )}
    </div>
  );
}
