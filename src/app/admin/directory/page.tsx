import { redirect } from "next/navigation";
import { desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { surveyorsDirectory } from "@/db/schema";
import { DirectoryReviewClient } from "./directory-review-client";

export default async function AdminDirectoryPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login?callbackUrl=/admin/directory");
  }
  if (session.user.role !== "admin") {
    redirect("/");
  }

  const listings = await db
    .select()
    .from(surveyorsDirectory)
    .orderBy(desc(surveyorsDirectory.createdAt));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
        Surveyor directory listings
      </h1>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Verify each signup against SURCON (use Surveyor checks) before
        activating it.
      </p>

      <DirectoryReviewClient
        initialListings={listings.map((l) => ({
          id: l.id,
          name: l.name,
          regNumber: l.regNumber,
          firmName: l.firmName,
          state: l.state,
          city: l.city,
          surconVerified: l.surconVerified,
          listingStatus: l.listingStatus,
        }))}
      />
    </div>
  );
}
