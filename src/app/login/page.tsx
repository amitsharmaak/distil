"use client";

import { useEffect, useState } from "react";
import { BrandMark } from "@/components/layout/brand-mark";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { useRouter } from "next/navigation";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setHydrated(true), []);

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
      const requested = new URLSearchParams(window.location.search).get("next");
      const destination =
        requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/save";
      router.replace(destination);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageContainer
      size="reading"
      className="flex min-h-[100dvh] items-center justify-center px-4 py-[calc(2rem+env(safe-area-inset-top,0px))]"
    >
      <div className="w-full max-w-sm space-y-7 rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <BrandMark className="mx-auto size-10" />
        <PageHeader
          title="Welcome to Distil"
          description="Sign in to your private knowledge space."
          className="text-center"
        />
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
          <Button
            type="submit"
            size="lg"
            className="min-h-11 w-full"
            disabled={!hydrated || submitting}
          >
            <LockKeyhole className="h-4 w-4" />
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </PageContainer>
  );
}
