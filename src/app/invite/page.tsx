"use client";

import { FormEvent, useState } from "react";

export default function InvitePage() {
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const invitationToken = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    window.history.replaceState({}, "", "/invite");
    const response = await fetch("/api/auth/invitations/request-link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: data.get("email"), invitationToken, next: "/onboarding" }),
    });
    setMessage(
      response.ok
        ? "Check your email for a one-time sign-in link."
        : "Unable to continue. Ask the operator who invited you for a new invitation."
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <meta content="no-referrer" name="referrer" />
      <div>
        <h1 className="text-2xl font-semibold">Accept your Distil invitation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the verified email address that received this invitation.
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
    </main>
  );
}
