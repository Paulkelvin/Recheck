"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadToCloudinary } from "@/lib/cloudinary-upload";

export function IntakeForm() {
  const router = useRouter();

  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [address, setAddress] = useState("");
  const [planNumber, setPlanNumber] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "uploading" | "saving">("idle");

  const submitting = step !== "idle";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      let uploadedDocs: string[] = [];

      if (files.length > 0) {
        setStep("uploading");
        uploadedDocs = await Promise.all(files.map(uploadToCloudinary));
      }

      setStep("saving");
      const res = await fetch("/api/land-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state,
          lga,
          address: address || undefined,
          planNumber: planNumber || undefined,
          sellerName: sellerName || undefined,
          uploadedDocs,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not submit your check");
      }

      const { report } = await res.json();
      router.push(`/check/${report.id}/payment`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("idle");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      {error && (
        <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          State
          <input
            required
            value={state}
            onChange={(e) => setState(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
          LGA
          <input
            required
            value={lga}
            onChange={(e) => setLga(e.target.value)}
            className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Address / description of the land
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Survey plan number (if you have one)
        <input
          value={planNumber}
          onChange={(e) => setPlanNumber(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Seller&apos;s name
        <input
          value={sellerName}
          onChange={(e) => setSellerName(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-zinc-700 dark:text-zinc-300">
        Documents (survey plan, deed, receipt — whatever you have)
        <input
          type="file"
          multiple
          accept="image/*,.pdf"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="rounded border border-zinc-300 px-3 py-2 text-black dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </label>

      <button
        type="submit"
        disabled={submitting}
        className="mt-2 flex h-12 items-center justify-center rounded-full bg-foreground text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {step === "uploading"
          ? "Uploading documents..."
          : step === "saving"
            ? "Submitting..."
            : "Continue to payment"}
      </button>
    </form>
  );
}
