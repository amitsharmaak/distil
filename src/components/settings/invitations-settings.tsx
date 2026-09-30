"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy, MailPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

interface InvitationRow {
  id: string;
  maskedEmail: string;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt?: string;
  revokedAt?: string;
  issuedByYou: boolean;
}

interface IssuedInvitation {
  invitationId: string;
  invitationUrl: string;
  expiresAt: string;
}

const formatDate = (value: string) => new Date(value).toLocaleDateString();

const statusLabel: Record<InvitationStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
};

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string } };
    return payload.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Admin-only invitation manager. The link is returned once by the API and is never
 * stored, so it is shown once here; a lost link means revoke and invite again.
 */
export function InvitationsSettings() {
  const [rows, setRows] = useState<InvitationRow[]>();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [issued, setIssued] = useState<IssuedInvitation>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<string>();
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/admin/invitations", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error(await readError(response, "Could not load invitations."));
    const payload = (await response.json()) as { invitations: InvitationRow[] };
    setRows(payload.invitations);
  }, []);

  useEffect(() => {
    void load().catch((caught) =>
      setError(caught instanceof Error ? caught.message : "Could not load invitations.")
    );
  }, [load]);

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setIssued(undefined);
    setCopied(false);
    try {
      const response = await fetch("/api/v1/admin/invitations", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          ...(note.trim() ? { note: note.trim() } : {}),
        }),
      });
      if (!response.ok)
        throw new Error(await readError(response, "Could not send the invitation."));
      setIssued((await response.json()) as IssuedInvitation);
      setEmail("");
      setNote("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.invitationUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  async function revoke(id: string) {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/admin/invitations/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(reason.trim() ? { reason: reason.trim() } : {}),
      });
      if (!response.ok)
        throw new Error(await readError(response, "Could not revoke the invitation."));
      setRevoking(undefined);
      setReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revoke the invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex gap-3">
          <MailPlus className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-semibold">Invite someone</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Distil does not send email. You get a link to pass on; the invitee opens it and
              requests a magic link for the invited address. A link is valid for 7 days.
            </p>
          </div>
        </div>

        <form onSubmit={(event) => void send(event)} className="mt-4 space-y-3">
          <div>
            <label htmlFor="invite-email" className="text-xs font-medium">
              Email address
            </label>
            <Input
              id="invite-email"
              type="email"
              required
              autoComplete="off"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="colleague@example.com"
              className="mt-1"
            />
          </div>
          <div>
            <label htmlFor="invite-note" className="text-xs font-medium">
              Note (optional, kept in the audit trail)
            </label>
            <Input
              id="invite-note"
              maxLength={200}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Design team pilot"
              className="mt-1"
            />
          </div>
          <Button type="submit" disabled={busy || !email.trim()} className="min-h-11">
            {busy && !revoking ? "Sending…" : "Send invitation"}
          </Button>
        </form>

        {issued && (
          <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <p className="text-sm font-medium">Copy this link now, it will not be shown again</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Expires {formatDate(issued.expiresAt)}. Send it to the invitee yourself.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded bg-background p-2 text-xs">
                {issued.invitationUrl}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void copyLink()}
                aria-label="Copy invitation link"
              >
                {copied ? <Check /> : <Copy />}
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold">Invitations</h3>
        {!rows ? (
          <p className="mt-3 text-xs text-muted-foreground">
            {error ? "Invitations could not be loaded." : "Loading…"}
          </p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            No invitations yet. After you send one, the invitee opens the link, enters the invited
            address and requests a magic link to finish signing up.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {rows.map((row) => (
              <li key={row.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{row.maskedEmail}</span>
                  <Badge variant={row.status === "pending" ? "default" : "outline"}>
                    {statusLabel[row.status]}
                  </Badge>
                  {row.status === "pending" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto h-8 text-xs"
                      onClick={() => {
                        setRevoking(row.id);
                        setReason("");
                      }}
                    >
                      Revoke…
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Invited {formatDate(row.createdAt)}
                  {row.acceptedAt
                    ? ` · Accepted ${formatDate(row.acceptedAt)}`
                    : row.revokedAt
                      ? ` · Revoked ${formatDate(row.revokedAt)}`
                      : ` · ${row.status === "expired" ? "Expired" : "Expires"} ${formatDate(row.expiresAt)}`}
                  {row.issuedByYou ? "" : " · by another admin"}
                </p>
                {revoking === row.id && (
                  <div className="mt-3 rounded-lg border border-border p-3">
                    <label htmlFor={`revoke-reason-${row.id}`} className="text-xs font-medium">
                      Reason (optional)
                    </label>
                    <Input
                      id={`revoke-reason-${row.id}`}
                      maxLength={200}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      className="mt-1"
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      The link stops working immediately.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={() => void revoke(row.id)}
                      >
                        {busy ? "Revoking…" : "Revoke invitation"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setRevoking(undefined)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
