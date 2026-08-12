"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default function ForSurveyorsPage() {
  const [name, setName] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [firmName, setFirmName] = useState("");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/directory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, regNumber, firmName, state, city, phone, email }),
    });

    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Could not submit your listing");
      return;
    }

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Listing submitted</h1>
        <p className="mt-2 text-sm text-muted">
          We&apos;ll verify your registration with SURCON before your profile goes live in
          the directory.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl flex-1 px-6 py-12">
      <h1 className="text-2xl font-semibold text-foreground">List your surveying practice</h1>
      <p className="mt-1 text-sm text-muted">
        We verify every listing against SURCON&apos;s register before it goes live.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <Label>
          Full name
          <Input required value={name} onChange={(e) => setName(e.target.value)} />
        </Label>

        <Label>
          SURCON registration number
          <Input required value={regNumber} onChange={(e) => setRegNumber(e.target.value)} />
        </Label>

        <Label>
          Firm name
          <Input value={firmName} onChange={(e) => setFirmName(e.target.value)} />
        </Label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Label>
            State
            <Input required value={state} onChange={(e) => setState(e.target.value)} />
          </Label>
          <Label>
            City
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Label>
            Phone
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Label>
          <Label>
            Email
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Label>
        </div>

        <Button type="submit" disabled={loading} size="lg" className="mt-2">
          {loading ? "Submitting..." : "Submit listing"}
        </Button>
      </form>
    </div>
  );
}
