"use client";

import { useState } from "react";

type Result = "pass" | "fail" | "flagged" | "inconclusive";

type FindingState = {
  result: Result;
  notes: string;
};

const CHECK_LABELS: Record<string, string> = {
  plan_authenticity: "Is this survey plan real?",
  overlap: "Has this land been sold to someone else?",
  acquisition: "Can the government take this land back?",
  dispute: "Is anyone else claiming this land?",
  size: "Am I getting the size I'm paying for?",
  encumbrance: "Does this land have hidden debt or court cases?",
};

export function FindingsForm({
  reportId,
  checkTypes,
  initialFindings,
}: {
  reportId: string;
  checkTypes: string[];
  initialFindings: { checkType: string; result: Result | null; notes: string | null }[];
}) {
  const initial: Record<string, FindingState> = {};
  for (const type of checkTypes) {
    const existing = initialFindings.find((f) => f.checkType === type);
    initial[type] = {
      result: existing?.result ?? "pass",
      notes: existing?.notes ?? "",
    };
  }

  const [saved, setSaved] = useState<Set<string>>(
    new Set(initialFindings.filter((f) => f.result !== null).map((f) => f.checkType)),
  );
  const [values, setValues] = useState(initial);
  const [savingType, setSavingType] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allReady, setAllReady] = useState(saved.size === checkTypes.length);

  const handleSave = async (checkType: string) => {
    setError(null);
    setSavingType(checkType);

    const res = await fetch(`/api/land-reports/${reportId}/findings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkType,
        result: values[checkType].result,
        notes: values[checkType].notes || undefined,
      }),
    });

    setSavingType(null);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not save finding");
      return;
    }

    const data = await res.json();
    setSaved((prev) => new Set(prev).add(checkType));
    setAllReady(Boolean(data.reportReady));
  };

  return (
    <div className="mt-8 flex flex-col gap-4">
      {allReady && (
        <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950 dark:text-green-300">
          All findings filled in — this report is now marked ready and visible to the buyer.
        </p>
      )}
      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {checkTypes.map((type) => (
        <div
          key={type}
          className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="flex items-center justify-between">
            <p className="font-medium text-black dark:text-zinc-50">{CHECK_LABELS[type]}</p>
            {saved.has(type) && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-950 dark:text-green-300">
                Saved
              </span>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Result
              <select
                value={values[type].result}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [type]: { ...prev[type], result: e.target.value as Result },
                  }))
                }
                className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="flagged">Flagged</option>
                <option value="inconclusive">Inconclusive</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Notes (shown to the buyer)
              <input
                value={values[type].notes}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [type]: { ...prev[type], notes: e.target.value },
                  }))
                }
                className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <button
              onClick={() => handleSave(type)}
              disabled={savingType === type}
              className="h-11 rounded-full border border-zinc-300 px-4 text-sm font-medium text-black transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              {savingType === type ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
