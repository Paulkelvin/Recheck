"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Label } from "@/components/ui/input";

export function AssignSurveyor({
  reportId,
  currentSurveyorId,
  surveyors,
}: {
  reportId: string;
  currentSurveyorId: string | null;
  surveyors: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(currentSurveyorId ?? "");
  const [saving, setSaving] = useState(false);

  const handleAssign = async () => {
    setSaving(true);
    await fetch(`/api/land-reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignedSurveyorId: selected || null,
        status: selected ? "surveyor_assigned" : undefined,
      }),
    });
    setSaving(false);
    router.refresh();
  };

  if (surveyors.length === 0) {
    return (
      <Card className="mt-6">
        <p className="text-sm text-muted">
          No surveyor/lawyer accounts yet. Seed one with a{" "}
          <code>surveyor</code> role to assign reports directly to them.
        </p>
      </Card>
    );
  }

  return (
    <Card className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
      <Label className="flex-1">
        Assign to
        <Select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Unassigned</option>
          {surveyors.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Label>
      <Button onClick={handleAssign} disabled={saving} variant="secondary">
        {saving ? "Saving..." : "Assign"}
      </Button>
    </Card>
  );
}
