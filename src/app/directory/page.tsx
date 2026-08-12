import Link from "next/link";
import { and, eq, desc } from "drizzle-orm";
import { db } from "@/db";
import { surveyorsDirectory } from "@/db/schema";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
        <h1 className="text-2xl font-semibold text-foreground">Find a licensed surveyor</h1>
        <Link href="/for-surveyors" className="text-sm font-medium text-brand underline">
          List your practice
        </Link>
      </div>

      <form className="mt-6 flex gap-2" action="/directory">
        <Input
          name="state"
          defaultValue={state ?? ""}
          placeholder="Filter by state (e.g. Lagos)"
          className="flex-1"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {listings.length === 0 ? (
        <p className="mt-8 text-sm text-muted">
          No surveyors found{state ? ` in ${state}` : ""}.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {listings.map((listing) => (
            <li key={listing.id}>
              <Link href={`/directory/${listing.id}`}>
                <Card className="flex items-center justify-between transition-colors hover:bg-background">
                  <div>
                    <p className="font-medium text-foreground">{listing.name}</p>
                    <p className="text-sm text-muted">
                      {listing.firmName && `${listing.firmName} · `}
                      {listing.city ? `${listing.city}, ` : ""}
                      {listing.state}
                    </p>
                  </div>
                  {listing.surconVerified && <Badge tone="success">SURCON Verified ✓</Badge>}
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
