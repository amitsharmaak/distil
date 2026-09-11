"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function readInvitationToken(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
}

function InvitationAcceptanceCard() {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const invitationToken = readInvitationToken();
    window.history.replaceState({}, "", "/invite");
    const response = await fetch("/api/auth/invitations/request-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: data.get("email"),
        invitationToken,
        next: "/onboarding",
      }),
    });
    setMessage(
      response.ok
        ? "If this email is eligible, a one-time sign-in link is on its way."
        : "Unable to continue. Ask the operator who invited you for a new invitation."
    );
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Sign in to Distil</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the email address linked to your Distil account or invitation.
        </p>
      </div>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          autoComplete="email"
          className="rounded-md border px-3 py-2"
          id="email"
          name="email"
          required
          type="email"
        />
        <button
          className="rounded-md bg-foreground px-3 py-2 text-background disabled:opacity-50"
          type="submit"
        >
          Email me a magic link
        </button>
      </form>
      {message ? (
        <p aria-live="polite" className="text-sm">
          {message}
        </p>
      ) : null}
    </>
  );
}

function ReturningUserSignInCard() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [showResetNotice, setShowResetNotice] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() =>
      setShowResetNotice(new URLSearchParams(window.location.search).get("reset") === "1")
    );
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const response = await fetch("/api/auth/sign-in/password", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(
          response.status === 401
            ? (payload.error?.message ?? "Invalid email or password")
            : "Unable to continue. Please try again."
        );
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function sendMagicLink(event: React.MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.closest("form");
    const email = (form?.elements.namedItem("email") as HTMLInputElement | null)?.value ?? "";
    setError(undefined);
    setNotice(undefined);
    const response = await fetch("/api/auth/sign-in/request-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setNotice(
      response.ok
        ? "If this email is eligible, a one-time sign-in link is on its way."
        : "Unable to continue. Please try again."
    );
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Sign in to Distil</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your email and password, or request a magic link instead.
        </p>
      </div>
      {showResetNotice ? (
        <p aria-live="polite" className="text-sm text-primary">
          Password updated. Sign in with your new password.
        </p>
      ) : null}
      <form className="flex flex-col gap-3" onSubmit={signIn}>
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <Input autoComplete="email" id="email" name="email" required type="email" />
        <label className="text-sm font-medium" htmlFor="password">
          Password
        </label>
        <Input
          autoComplete="current-password"
          id="password"
          name="password"
          required
          type="password"
        />
        <Button disabled={submitting} type="submit">
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
        <Button onClick={sendMagicLink} type="button" variant="outline">
          Email me a magic link instead
        </Button>
      </form>
      <a className="text-sm underline" href="/reset-password">
        Forgot your password or never set one?
      </a>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p aria-live="polite" className="text-sm">
          {notice}
        </p>
      ) : null}
    </>
  );
}

export default function InvitePage() {
  const [acceptingInvitation, setAcceptingInvitation] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => setAcceptingInvitation(Boolean(readInvitationToken())));
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <meta content="no-referrer" name="referrer" />
      {acceptingInvitation ? <InvitationAcceptanceCard /> : <ReturningUserSignInCard />}
    </main>
  );
}
