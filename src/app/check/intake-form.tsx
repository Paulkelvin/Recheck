"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadToCloudinary } from "@/lib/cloudinary-upload";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Label } from "@/components/ui/input";

type TierInfo = { label: string; description: string; priceNaira: number };

export function IntakeForm({
  tiers,
}: {
  tiers: { quick: TierInfo; full: TierInfo };
}) {
  const router = useRouter();

  const [tier, setTier] = useState<"quick" | "full">("full");
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
          tier,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not submit your check");
      }

      const { report } = await res.json();
      fetch(`/api/land-reports/${report.id}/preview`, { method: "POST" }).catch(() => {});
      router.push(`/check/${report.id}/payment`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("idle");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {(["quick", "full"] as const).map((key) => (
          <label
            key={key}
            className={cn(
              "flex cursor-pointer flex-col gap-1 rounded-xl border bg-surface p-4 text-sm",
              tier === key ? "border-brand ring-1 ring-brand" : "border-border",
            )}
          >
            <span className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-medium text-foreground">
                <input
                  type="radio"
                  name="tier"
                  checked={tier === key}
                  onChange={() => setTier(key)}
                />
                {tiers[key].label}
              </span>
              <span className="font-medium text-foreground">
                ₦{tiers[key].priceNaira.toLocaleString()}
              </span>
            </span>
            <span className="text-muted">{tiers[key].description}</span>
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Label>
          State
          <Input required value={state} onChange={(e) => setState(e.target.value)} />
        </Label>
        <Label>
          LGA
          <Input required value={lga} onChange={(e) => setLga(e.target.value)} />
        </Label>
      </div>

      <Label>
        Address / description of the land
        <Textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
        />
      </Label>

      <Label>
        Survey plan number (if you have one)
        <Input value={planNumber} onChange={(e) => setPlanNumber(e.target.value)} />
      </Label>

      <Label>
        Seller&apos;s name
        <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} />
      </Label>

      <Label>
        Documents (survey plan, deed, receipt — whatever you have)
        <Input
          type="file"
          multiple
          accept="image/*,.pdf"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </Label>

      <Button type="submit" disabled={submitting} size="lg" className="mt-2">
        {step === "uploading"
          ? "Uploading documents..."
          : step === "saving"
            ? "Submitting..."
            : "Continue to payment"}
      </Button>
    </form>
  );
}
