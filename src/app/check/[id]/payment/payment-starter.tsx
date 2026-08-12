"use client";

import { useEffect, useState } from "react";

export function PaymentStarter({ reportId }: { reportId: string }) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      const res = await fetch(`/api/land-reports/${reportId}/pay`, { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (cancelled) return;

      if (!res.ok) {
        setError(
          res.status === 503
            ? "Payments aren't set up yet. Please check back soon."
            : data.error || "Could not start payment",
        );
        return;
      }

      window.location.href = data.authorizationUrl;
    };

    start();

    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (error) {
    return (
      <p className="mt-6 rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
        {error}
      </p>
    );
  }

  return (
    <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
      Redirecting you to checkout...
    </p>
  );
}
