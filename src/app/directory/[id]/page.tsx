import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { surveyorsDirectory } from "@/db/schema";
import { Badge } from "@/components/ui/badge";

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
        <h1 className="text-2xl font-semibold text-foreground">{listing.name}</h1>
        {listing.surconVerified && <Badge tone="success">SURCON Verified ✓</Badge>}
      </div>

      {listing.firmName && <p className="mt-1 text-muted">{listing.firmName}</p>}

      <dl className="mt-8 flex flex-col gap-3 text-sm">
        <div className="flex justify-between border-b border-border pb-2">
          <dt className="text-muted">Registration number</dt>
          <dd className="text-foreground">{listing.regNumber}</dd>
        </div>
        <div className="flex justify-between border-b border-border pb-2">
          <dt className="text-muted">State</dt>
          <dd className="text-foreground">
            {listing.city ? `${listing.city}, ` : ""}
            {listing.state}
          </dd>
        </div>
        {listing.phone && (
          <div className="flex justify-between border-b border-border pb-2">
            <dt className="text-muted">Phone</dt>
            <dd className="text-foreground">{listing.phone}</dd>
          </div>
        )}
        {listing.email && (
          <div className="flex justify-between border-b border-border pb-2">
            <dt className="text-muted">Email</dt>
            <dd className="text-foreground">{listing.email}</dd>
          </div>
        )}
      </dl>

      {!listing.surconVerified && (
        <p className="mt-6 text-sm text-muted">
          This listing hasn&apos;t been verified against SURCON&apos;s register yet.
        </p>
      )}
    </div>
  );
}
