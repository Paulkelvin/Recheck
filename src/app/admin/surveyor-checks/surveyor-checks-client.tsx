"use client";

import { useEffect, useState } from "react";

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
      <form
        onSubmit={handleCreate}
        className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-end"
      >
        <label className="flex flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Surveyor name
          <input
            required
            value={surveyorName}
            onChange={(e) => setSurveyorName(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          Reg number (optional)
          <input
            value={regNumber}
            onChange={(e) => setRegNumber(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="h-11 rounded-full bg-foreground px-5 text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {submitting ? "Queuing..." : "Queue check"}
        </button>
      </form>

      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading...</p>
      ) : checks.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No checks queued yet.
        </p>
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
    <li className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium text-black dark:text-zinc-50">
          {check.surveyorName}
          {check.regNumber && (
            <span className="ml-2 text-sm text-zinc-500">
              ({check.regNumber})
            </span>
          )}
        </p>
        <StatusBadge status={check.status} />
      </div>

      {check.status ? (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {check.rawResult || "No notes"} — checked{" "}
          {check.checkedAt ? new Date(check.checkedAt).toLocaleString() : ""} (
          {check.method})
        </p>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {autoError && (
            <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {autoError}
            </p>
          )}

          <button
            onClick={handleRunAutomated}
            disabled={running}
            className="h-10 self-start rounded-full border border-zinc-300 px-4 text-sm font-medium text-black transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
          >
            {running ? "Running..." : "Run automated check"}
          </button>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Result
              <select
                value={status}
                onChange={(e) =>
                  setStatus(e.target.value as Exclude<CheckStatus, null>)
                }
                className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="registered">Registered</option>
                <option value="not_found">Not found</option>
                <option value="suspended">Suspended</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
              Notes
              <input
                value={rawResult}
                onChange={(e) => setRawResult(e.target.value)}
                placeholder="e.g. firm name, what SURCON showed"
                className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
            </label>
            <button
              onClick={() => onResolve(check.id, status, rawResult)}
              className="h-11 rounded-full border border-zinc-300 px-4 text-sm font-medium text-black transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-50 dark:hover:bg-zinc-900"
            >
              Save result manually
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  if (!status) {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        Pending
      </span>
    );
  }

  const styles: Record<Exclude<CheckStatus, null>, string> = {
    registered:
      "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
    not_found: "bg-zinc-200 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300",
    suspended: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  };

  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}
