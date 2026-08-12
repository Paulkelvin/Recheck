"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

type Member = { id: string; name: string; email: string; createdAt: string };

export function TeamClient() {
  const [team, setTeam] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch("/api/admin/team");
    if (res.ok) {
      const data = await res.json();
      setTeam(data.team);
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

    const res = await fetch("/api/admin/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not create account");
      return;
    }

    setName("");
    setEmail("");
    setPassword("");
    load();
  };

  return (
    <div className="mt-8 flex flex-col gap-8">
      <Card>
        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Label className="flex-1">
            Name
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </Label>
          <Label className="flex-1">
            Email
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Label>
          <Label className="flex-1">
            Temporary password
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Label>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Adding..." : "Add"}
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
      ) : team.length === 0 ? (
        <p className="text-sm text-muted">No team members added yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {team.map((member) => (
            <li key={member.id}>
              <Card className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">{member.name}</p>
                  <p className="text-sm text-muted">{member.email}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
