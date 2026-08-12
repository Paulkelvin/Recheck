"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/check";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Signup failed");
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", { email, password, redirect: false });

    setLoading(false);

    if (result?.error) {
      setError("Account created, but sign-in failed. Try logging in.");
      router.push("/login");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  };

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-16">
      <Card className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <h1 className="text-xl font-semibold text-foreground">Create your account</h1>

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
            Email
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Label>

          <Label>
            Phone
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Label>

          <Label>
            Password
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Label>

          <label className="flex items-start gap-2 text-sm text-muted">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I agree to the{" "}
              <a href="/privacy" target="_blank" className="text-brand underline">
                Privacy Policy
              </a>{" "}
              and consent to my information being used to carry out land checks.
            </span>
          </label>

          <Button type="submit" disabled={loading || !consent} size="lg" className="mt-2">
            {loading ? "Creating account..." : "Create account"}
          </Button>

          <p className="text-center text-sm text-muted">
            Already have an account?{" "}
            <a href="/login" className="font-medium text-brand underline">
              Sign in
            </a>
          </p>
        </form>
      </Card>
    </div>
  );
}
