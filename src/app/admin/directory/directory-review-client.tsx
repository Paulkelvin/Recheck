"use client";

import { useState } from "react";

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
    return (
      <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
        No listings submitted yet.
      </p>
    );
  }

  return (
    <ul className="mt-8 flex flex-col gap-3">
      {listings.map((listing) => (
        <li
          key={listing.id}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div>
            <p className="font-medium text-black dark:text-zinc-50">
              {listing.name}{" "}
              <span className="font-normal text-zinc-500">({listing.regNumber})</span>
            </p>
            <p className="text-sm text-zinc-500">
              {listing.firmName && `${listing.firmName} · `}
              {listing.city ? `${listing.city}, ` : ""}
              {listing.state}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={listing.surconVerified}
                disabled={savingId === listing.id}
                onChange={(e) => update(listing.id, { surconVerified: e.target.checked })}
              />
              SURCON verified
            </label>
            <button
              onClick={() =>
                update(listing.id, {
                  listingStatus: listing.listingStatus === "active" ? "pending" : "active",
                })
              }
              disabled={savingId === listing.id}
              className="h-9 rounded-full border border-zinc-300 px-3 text-sm font-medium text-black transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              {listing.listingStatus === "active" ? "Deactivate" : "Activate"}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
