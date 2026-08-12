"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Listing = {
  id: string;
  name: string;
  regNumber: string;
  firmName: string | null;
  state: string;
  city: string | null;
  surconVerified: boolean;
  listingStatus: "active" | "pending";
};

export function DirectoryReviewClient({
  initialListings,
}: {
  initialListings: Listing[];
}) {
  const [listings, setListings] = useState(initialListings);
  const [savingId, setSavingId] = useState<string | null>(null);

  const update = async (id: string, patch: Partial<Pick<Listing, "listingStatus" | "surconVerified">>) => {
    setSavingId(id);
    const res = await fetch(`/api/directory/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setSavingId(null);

    if (res.ok) {
      setListings((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    }
  };

  if (listings.length === 0) {
    return <p className="mt-8 text-sm text-muted">No listings submitted yet.</p>;
  }

  return (
    <ul className="mt-8 flex flex-col gap-3">
      {listings.map((listing) => (
        <li key={listing.id}>
          <Card className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium text-foreground">
                {listing.name} <span className="font-normal text-muted">({listing.regNumber})</span>
              </p>
              <p className="text-sm text-muted">
                {listing.firmName && `${listing.firmName} · `}
                {listing.city ? `${listing.city}, ` : ""}
                {listing.state}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={listing.surconVerified}
                  disabled={savingId === listing.id}
                  onChange={(e) => update(listing.id, { surconVerified: e.target.checked })}
                />
                SURCON verified
              </label>
              <Button
                onClick={() =>
                  update(listing.id, {
                    listingStatus: listing.listingStatus === "active" ? "pending" : "active",
                  })
                }
                disabled={savingId === listing.id}
                variant="secondary"
                size="sm"
              >
                {listing.listingStatus === "active" ? "Deactivate" : "Activate"}
              </Button>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
