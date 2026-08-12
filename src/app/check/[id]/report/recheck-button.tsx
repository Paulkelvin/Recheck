"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RecheckButton({
  reportId,
  discountPercent,
}: {
  reportId: string;
  discountPercent: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/land-reports/${reportId}/recheck`, { method: "POST" });
    const data = await res.json().catch(() => ({}));

    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Could not start a re-check");
      return;
    }

    router.push(`/check/${data.report.id}/payment`);
  };

  return (
    <div className="flex flex-col gap-1">
      <Button onClick={handleClick} disabled={loading} variant="secondary">
        {loading ? "Starting..." : `Request a re-check (${discountPercent}% off)`}
      </Button>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
