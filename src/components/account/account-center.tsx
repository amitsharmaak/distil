"use client";

import { FormEvent, useEffect, useState } from "react";
import { Download, Monitor, ShieldAlert, Trash2 } from "lucide-react";

import { TokenSettings } from "@/components/capture/token-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AccountProfile {
  userId: string;
  status: "active" | "suspended" | "deletion_pending" | "deleted" | "migration_pending";
  displayName?: string;
  timezone: string;
  onboardingCompleted: boolean;
  privacy: { allowPersonalization: boolean; allowAiProcessing: boolean };
}

interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress?: string;
  userAgent?: string;
  current: boolean;
}

interface ExportRequest {
  id: string;
  status: string;
  requestedAt: string;
  completedAt?: string;
}

interface DeletionRequest {
  id: string;
  status: string;
  purgeAfter?: string;
}

function messageFor(response: Response, fallback: string): Promise<string> {
  return response
    .json()
    .then((payload: { error?: { message?: string } }) => payload.error?.message ?? fallback)
    .catch(() => fallback);
}

export function AccountCenter({ onboarding = false }: { onboarding?: boolean }) {
  const [account, setAccount] = useState<AccountProfile>();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [exports, setExports] = useState<ExportRequest[]>([]);
  const [deletion, setDeletion] = useState<DeletionRequest | null>();
  const [usage, setUsage] = useState<{ aiAvailable?: boolean }>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function load() {
    setError(undefined);
    const profile = await fetch("/api/v1/account", { headers: { Accept: "application/json" } });
    if (!profile.ok) throw new Error(await messageFor(profile, "Could not load your account."));
    const payload = (await profile.json()) as { account: AccountProfile };
    setAccount(payload.account);

    const [sessionResponse, usageResponse] = await Promise.all([
      fetch("/api/v1/account/sessions", { headers: { Accept: "application/json" } }),
      fetch("/api/v1/account/usage", { headers: { Accept: "application/json" } }),
    ]);
    if (sessionResponse.ok)
      setSessions(((await sessionResponse.json()) as { sessions: Session[] }).sessions);
    if (usageResponse.ok) setUsage((await usageResponse.json()) as { aiAvailable?: boolean });
  }

  useEffect(() => {
    void Promise.resolve()
      .then(load)
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "Could not load your account.")
      );
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account) return;
    setSaving(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/account", {
      method: "PATCH",
      headers: { "content-type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        displayName: form.get("displayName"),
        timezone: form.get("timezone"),
        onboardingCompleted: onboarding || account.onboardingCompleted,
        privacy: {
          allowPersonalization: form.get("allowPersonalization") === "on",
          allowAiProcessing: form.get("allowAiProcessing") === "on",
        },
      }),
    });
    setSaving(false);
    if (!response.ok) {
      setError(await messageFor(response, "Could not save your account."));
      return;
    }
    const payload = (await response.json()) as { account: AccountProfile };
    setAccount(payload.account);
    setNotice(onboarding ? "Your account is ready." : "Account details saved.");
  }

  async function revokeSession(id: string) {
    const response = await fetch(`/api/v1/account/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setError(
        await messageFor(response, "Could not revoke that session. Please authenticate again.")
      );
      return;
    }
    setSessions((current) => current.filter((session) => session.id !== id));
  }

  async function revokeOthers() {
    const response = await fetch("/api/v1/account/sessions/revoke-others", { method: "POST" });
    if (!response.ok) {
      setError(
        await messageFor(response, "Could not revoke other sessions. Please authenticate again.")
      );
      return;
    }
    setSessions((current) => current.filter((session) => session.current));
    setNotice("Other sessions have been revoked.");
  }

  async function requestExport() {
    const response = await fetch("/api/v1/account/export", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
    });
    if (!response.ok) {
      setError(
        await messageFor(response, "Could not request an export. Please authenticate again.")
      );
      return;
    }
    const payload = (await response.json()) as { export: ExportRequest };
    setExports((current) => [
      payload.export,
      ...current.filter((item) => item.id !== payload.export.id),
    ]);
    setNotice("Your export has been requested. It will appear here when ready.");
  }

  async function refreshExport(id: string) {
    const response = await fetch(`/api/v1/account/exports/${encodeURIComponent(id)}`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      setError(await messageFor(response, "Could not refresh this export."));
      return;
    }
    const payload = (await response.json()) as { export: ExportRequest };
    setExports((current) => [
      payload.export,
      ...current.filter((item) => item.id !== payload.export.id),
    ]);
  }

  async function requestDeletion() {
    const response = await fetch("/api/v1/account/deletion", { method: "POST" });
    if (!response.ok) {
      setError(
        await messageFor(response, "Could not request account deletion. Please authenticate again.")
      );
      return;
    }
    const payload = (await response.json()) as { deletion: DeletionRequest };
    setDeletion(payload.deletion);
    setNotice("Deletion is scheduled. You can cancel during the grace period.");
  }

  async function cancelDeletion() {
    const response = await fetch("/api/v1/account/deletion", { method: "DELETE" });
    if (!response.ok) {
      setError(await messageFor(response, "Could not cancel deletion. Please authenticate again."));
      return;
    }
    setDeletion(((await response.json()) as { deletion: DeletionRequest }).deletion);
    setNotice("Account deletion has been cancelled.");
  }

  if (!account) {
    return (
      <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {error ?? "Loading account…"}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <form className="rounded-xl border border-border bg-card p-5" onSubmit={saveProfile}>
        <h2 className="text-base font-semibold">
          {onboarding ? "Set up your account" : "Profile and privacy"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your timezone keeps daily briefs and dates aligned to your day. Privacy controls apply
          only to your account.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Display name
            <Input
              className="mt-1"
              defaultValue={account.displayName}
              name="displayName"
              required
            />
          </label>
          <label className="text-sm font-medium">
            Timezone (IANA)
            <Input
              className="mt-1"
              defaultValue={account.timezone}
              name="timezone"
              required
              placeholder="Asia/Kolkata"
            />
          </label>
        </div>
        <div className="mt-5 space-y-3 text-sm">
          <label className="flex items-start gap-3">
            <input
              defaultChecked={account.privacy.allowPersonalization}
              name="allowPersonalization"
              type="checkbox"
            />
            <span>
              <span className="font-medium">Personalize my brief</span>
              <br />
              <span className="text-muted-foreground">
                Use your own reading activity to improve ranking.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3">
            <input
              defaultChecked={account.privacy.allowAiProcessing}
              name="allowAiProcessing"
              type="checkbox"
            />
            <span>
              <span className="font-medium">Allow AI processing</span>
              <br />
              <span className="text-muted-foreground">
                Generate summaries and knowledge features for your saved content.
              </span>
            </span>
          </label>
        </div>
        <Button className="mt-5" disabled={saving} type="submit">
          {saving ? "Saving…" : onboarding ? "Finish setup" : "Save changes"}
        </Button>
      </form>

      {onboarding ? null : (
        <>
          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex gap-3">
              <Monitor className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold">Sessions and devices</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Revoke a device you do not recognize. This requires recent authentication.
                </p>
              </div>
            </div>
            {sessions.length ? (
              <div className="mt-5 space-y-3">
                {sessions.map((session) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
                    key={session.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {session.current ? "This device" : (session.userAgent ?? "Unknown device")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Last used {new Date(session.updatedAt).toLocaleString()}
                      </p>
                    </div>
                    {session.current ? (
                      <span className="text-xs text-muted-foreground">Current</span>
                    ) : (
                      <Button
                        onClick={() => void revokeSession(session.id)}
                        size="sm"
                        variant="outline"
                      >
                        Revoke
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No provider sessions are available while account authentication is disabled.
              </p>
            )}
            {sessions.some((session) => !session.current) ? (
              <Button
                className="mt-4"
                onClick={() => void revokeOthers()}
                size="sm"
                variant="outline"
              >
                Revoke other sessions
              </Button>
            ) : null}
          </section>

          <TokenSettings />

          <section className="rounded-xl border border-border bg-card p-5">
            <div className="flex gap-3">
              <Download className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="text-base font-semibold">Your data export</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Request a portable copy of your account data. Downloads are private and
                  short-lived.
                </p>
              </div>
            </div>
            <Button
              className="mt-4"
              onClick={() => void requestExport()}
              size="sm"
              variant="outline"
            >
              Request export
            </Button>
            {exports.length ? (
              <div className="mt-4 space-y-2">
                {exports.map((item) => (
                  <div
                    className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
                    key={item.id}
                  >
                    <span>{item.status}</span>
                    {item.status === "ready" ? (
                      <a
                        className="underline"
                        href={`/api/v1/account/exports/${encodeURIComponent(item.id)}/download`}
                      >
                        Download
                      </a>
                    ) : (
                      <Button onClick={() => void refreshExport(item.id)} size="sm" variant="ghost">
                        Refresh status
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-destructive/40 bg-card p-5">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <h2 className="text-base font-semibold">Account deletion</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Deletion revokes access immediately. You can cancel until the scheduled purge
                  begins.
                </p>
              </div>
            </div>
            {deletion && deletion.status !== "cancelled" ? (
              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <span>
                  Deletion status: {deletion.status}
                  {deletion.purgeAfter
                    ? ` · purge after ${new Date(deletion.purgeAfter).toLocaleDateString()}`
                    : ""}
                </span>
                <Button onClick={() => void cancelDeletion()} size="sm" variant="outline">
                  Cancel deletion
                </Button>
              </div>
            ) : (
              <Button
                className="mt-4"
                onClick={() => void requestDeletion()}
                size="sm"
                variant="destructive"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Request deletion
              </Button>
            )}
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">Usage and quota</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {usage?.aiAvailable === false
                ? "AI usage is currently unavailable; capture remains durable."
                : "Your usage limits are calculated per account."}
            </p>
          </section>
        </>
      )}

      {notice ? (
        <p aria-live="polite" className="text-sm text-primary">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p aria-live="polite" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
