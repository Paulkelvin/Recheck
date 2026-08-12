import Link from "next/link";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { surveyorsDirectory } from "@/db/schema";

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state } = await searchParams;

  const conditions = [eq(surveyorsDirectory.listingStatus, "active")];
  if (state) conditions.push(eq(surveyorsDirectory.state, state));

  const listings = await db
    .select()
    .from(surveyorsDirectory)
    .where(and(...conditions))
    .orderBy(desc(surveyorsDirectory.createdAt));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Find a licensed surveyor
        </h1>
        <Link
          href="/for-surveyors"
          className="text-sm font-medium text-black underline dark:text-zinc-50"
        >
          List your practice
        </Link>
      </div>

      <form className="mt-6 flex gap-2" action="/directory">
        <input
          name="state"
          defaultValue={state ?? ""}
          placeholder="Filter by state (e.g. Lagos)"
          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
        <button
          type="submit"
          className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
        >
          Search
        </button>
      </form>

      {listings.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
          No surveyors found{state ? ` in ${state}` : ""}.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {listings.map((listing) => (
            <li key={listing.id}>
              <Link
                href={`/directory/${listing.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <div>
                  <p className="font-medium text-black dark:text-zinc-50">
                    {listing.name}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {listing.firmName && `${listing.firmName} · `}
                    {listing.city ? `${listing.city}, ` : ""}
                    {listing.state}
                  </p>
                </div>
                {listing.surconVerified && (
                  <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                    SURCON Verified ✓
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
