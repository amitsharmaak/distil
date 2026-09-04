"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ password: form.get("password") }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to sign in.");
      router.replace("/save");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-[calc(2rem+env(safe-area-inset-top,0px))]">
      <div className="w-full max-w-sm space-y-7 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <header className="text-center">
          <Image
            src="/logo.png"
            alt="Distil"
            width={64}
            height={40}
            className="mx-auto h-10 w-auto rounded-md object-cover"
            priority
          />
          <h1 className="mt-5 font-serif text-2xl font-semibold">Welcome to Distil</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to your private knowledge space.
          </p>
        </header>
        <form onSubmit={login} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" className="min-h-11 w-full" disabled={submitting}>
            <LockKeyhole className="h-4 w-4" />
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </div>
  );
}
