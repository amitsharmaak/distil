"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const GENERIC_REQUEST_MESSAGE =
  "If this email belongs to a Distil account, a password link is on its way.";
const INVALID_LINK_MESSAGE = "This link is invalid or has expired.";

function RequestResetForm({ invalidLink }: { invalidLink: boolean }) {
  const [notice, setNotice] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setNotice(undefined);
    try {
      await fetch("/api/auth/password/request-reset", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ email: data.get("email") }),
      });
      setNotice(GENERIC_REQUEST_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Reset your password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {invalidLink ? INVALID_LINK_MESSAGE : "Enter your email to receive a password link."}
        </p>
      </div>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="text-sm font-medium" htmlFor="email">
          Email
        </label>
        <Input autoComplete="email" id="email" name="email" required type="email" />
        <Button disabled={submitting} type="submit">
          Email me a password link
        </Button>
      </form>
      {notice ? (
        <p aria-live="polite" className="text-sm">
          {notice}
        </p>
      ) : null}
    </>
  );
}

function SetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [mismatch, setMismatch] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newPassword = String(data.get("newPassword") ?? "");
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    setError(undefined);
    if (newPassword !== confirmPassword) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setSubmitting(true);
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(payload.error?.message ?? "Unable to reset your password. Please try again.");
        return;
      }
      router.replace("/invite?reset=1");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">At least 12 characters</p>
      </div>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <label className="text-sm font-medium" htmlFor="newPassword">
          New password
        </label>
        <Input
          autoComplete="new-password"
          id="newPassword"
          minLength={12}
          name="newPassword"
          required
          type="password"
        />
        <label className="text-sm font-medium" htmlFor="confirmPassword">
          Confirm password
        </label>
        <Input
          autoComplete="new-password"
          id="confirmPassword"
          minLength={12}
          name="confirmPassword"
          required
          type="password"
        />
        {mismatch ? (
          <p role="alert" className="text-sm text-destructive">
            Passwords do not match.
          </p>
        ) : null}
        <Button disabled={submitting} type="submit">
          {submitting ? "Saving…" : "Save new password"}
        </Button>
      </form>
      {error ? (
        <>
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <a className="text-sm underline" href="/reset-password">
            Request a new link
          </a>
        </>
      ) : null}
    </>
  );
}

export default function ResetPasswordPage() {
  const [hydrated, setHydrated] = useState(false);
  const [token, setToken] = useState("");
  const [invalidLink, setInvalidLink] = useState(false);

  useEffect(() => {
    void Promise.resolve().then(() => {
      const params = new URLSearchParams(window.location.search);
      setToken(params.get("token") ?? "");
      setInvalidLink(Boolean(params.get("error")));
      setHydrated(true);
    });
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <meta content="no-referrer" name="referrer" />
      {hydrated && token && !invalidLink ? (
        <SetPasswordForm token={token} />
      ) : (
        <RequestResetForm invalidLink={invalidLink} />
      )}
    </main>
  );
}
