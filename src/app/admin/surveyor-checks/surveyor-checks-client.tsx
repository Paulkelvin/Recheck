"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

type CheckStatus = "registered" | "not_found" | "suspended" | null;

type SurveyorCheck = {
  id: string;
  surveyorName: string;
  regNumber: string | null;
  status: CheckStatus;
  method: "automated" | "manual";
  rawResult: string | null;
  checkedAt: string | null;
  createdAt: string;
};

export function SurveyorChecksClient() {
  const [checks, setChecks] = useState<SurveyorCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [surveyorName, setSurveyorName] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/surveyor-check");
    if (res.ok) {
      const data = await res.json();
      setChecks(data.checks);
    }
    setLoading(false);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch on mount
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await fetch("/api/surveyor-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surveyorName, regNumber: regNumber || undefined }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to queue check");
      return;
    }

    setSurveyorName("");
    setRegNumber("");
    load();
  };

  const handleResolve = async (
    id: string,
    status: Exclude<CheckStatus, null>,
    rawResult: string,
  ) => {
    await fetch(`/api/surveyor-check/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, rawResult }),
    });
    load();
  };

  return (
    <div className="mt-8 flex flex-col gap-8">
      <Card>
        <form
          onSubmit={handleCreate}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <Label className="flex-1">
            Surveyor name
            <Input required value={surveyorName} onChange={(e) => setSurveyorName(e.target.value)} />
          </Label>
          <Label className="flex-1">
            Reg number (optional)
            <Input value={regNumber} onChange={(e) => setRegNumber(e.target.value)} />
          </Label>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Queuing..." : "Queue check"}
          </Button>
        </form>
      </Card>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted">Loading...</p>
      ) : checks.length === 0 ? (
        <p className="text-sm text-muted">No checks queued yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {checks.map((check) => (
            <CheckRow key={check.id} check={check} onResolve={handleResolve} onRefresh={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CheckRow({
  check,
  onResolve,
  onRefresh,
}: {
  check: SurveyorCheck;
  onResolve: (
    id: string,
    status: Exclude<CheckStatus, null>,
    rawResult: string,
  ) => void;
  onRefresh: () => void;
}) {
  const [status, setStatus] = useState<Exclude<CheckStatus, null>>(
    check.status ?? "registered",
  );
  const [rawResult, setRawResult] = useState(check.rawResult ?? "");
  const [running, setRunning] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);

  const handleRunAutomated = async () => {
    setRunning(true);
    setAutoError(null);

    const res = await fetch(`/api/surveyor-check/${check.id}/run-automated`, {
      method: "POST",
    });
    const data = await res.json().catch(() => ({}));

    setRunning(false);

    if (!res.ok) {
      setAutoError(data.error || "Automated check failed — resolve it manually below.");
      return;
    }

    onRefresh();
  };

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-medium text-foreground">
            {check.surveyorName}
            {check.regNumber && <span className="ml-2 text-sm text-muted">({check.regNumber})</span>}
          </p>
          <StatusBadge status={check.status} />
        </div>

        {check.status ? (
          <p className="mt-2 text-sm text-muted">
            {check.rawResult || "No notes"} — checked{" "}
            {check.checkedAt ? new Date(check.checkedAt).toLocaleString() : ""} ({check.method})
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {autoError && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {autoError}
              </p>
            )}

            <Button
              onClick={handleRunAutomated}
              disabled={running}
              variant="secondary"
              size="sm"
              className="self-start"
            >
              {running ? "Running..." : "Run automated check"}
            </Button>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <Label>
                Result
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Exclude<CheckStatus, null>)}
                >
                  <option value="registered">Registered</option>
                  <option value="not_found">Not found</option>
                  <option value="suspended">Suspended</option>
                </Select>
              </Label>
              <Label className="flex-1">
                Notes
                <Input
                  value={rawResult}
                  onChange={(e) => setRawResult(e.target.value)}
                  placeholder="e.g. firm name, what SURCON showed"
                />
              </Label>
              <Button
                onClick={() => onResolve(check.id, status, rawResult)}
                variant="secondary"
              >
                Save result manually
              </Button>
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  if (!status) return <Badge tone="warning">Pending</Badge>;

  const tones: Record<Exclude<CheckStatus, null>, "success" | "neutral" | "danger"> = {
    registered: "success",
    not_found: "neutral",
    suspended: "danger",
  };

  return <Badge tone={tones[status]}>{status.replace("_", " ")}</Badge>;
}
