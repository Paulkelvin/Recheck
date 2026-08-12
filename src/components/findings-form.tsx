"use client";

import { useState } from "react";
import { CHECK_LABELS, type CheckType } from "@/lib/report-tiers";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Input, Label } from "@/components/ui/input";

type Result = "pass" | "fail" | "flagged" | "inconclusive";

type FindingState = {
  result: Result;
  notes: string;
};

export function FindingsForm({
  reportId,
  checkTypes,
  initialFindings,
}: {
  reportId: string;
  checkTypes: CheckType[];
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
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
          All findings filled in — this report is now marked ready and visible to the buyer.
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {checkTypes.map((type) => (
        <Card key={type}>
          <div className="flex items-center justify-between">
            <p className="font-medium text-foreground">{CHECK_LABELS[type]}</p>
            {saved.has(type) && <Badge tone="success">Saved</Badge>}
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <Label>
              Result
              <Select
                value={values[type].result}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [type]: { ...prev[type], result: e.target.value as Result },
                  }))
                }
              >
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="flagged">Flagged</option>
                <option value="inconclusive">Inconclusive</option>
              </Select>
            </Label>
            <Label className="flex-1">
              Notes (shown to the buyer)
              <Input
                value={values[type].notes}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [type]: { ...prev[type], notes: e.target.value },
                  }))
                }
              />
            </Label>
            <Button
              onClick={() => handleSave(type)}
              disabled={savingType === type}
              variant="secondary"
            >
              {savingType === type ? "Saving..." : "Save"}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
