"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CaptureTokenSummary {
  id: string;
  name: string;
  kind: "manual" | "browser" | "phone";
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

interface IssuedToken extends CaptureTokenSummary {
  token: string;
}

const formatDate = (value: string) => new Date(value).toLocaleDateString();

/** Manages the account's manual capture token: generate once, copy once, regenerate to replace. */
export function TokenSettings() {
  const [active, setActive] = useState<CaptureTokenSummary[]>();
  const [issued, setIssued] = useState<IssuedToken>();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadTokens() {
    const response = await fetch("/api/v1/capture-tokens", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Could not load your capture token.");
    const payload = (await response.json()) as { tokens: CaptureTokenSummary[] };
    setActive(payload.tokens.filter((token) => token.kind === "manual" && !token.revokedAt));
  }

  useEffect(() => {
    void loadTokens().catch((caught) => setError(caught.message));
  }, []);

  async function generate() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/v1/capture-tokens", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as {
        token?: IssuedToken;
        error?: { message?: string };
      };
      if (!response.ok || !payload.token)
        throw new Error(payload.error?.message ?? "Could not generate a token.");
      setIssued(payload.token);
      setConfirming(false);
      await loadTokens();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not generate a token.");
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  const current = active?.[0];
  const hasToken = Boolean(current);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Capture token</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            For scripts and capture clients that use a token.
          </p>
        </div>
      </div>

      {active && (
        <div className="mt-5">
          {current ? (
            <div className="rounded-lg border border-border p-3">
              <p className="font-mono text-sm">{current.tokenPrefix}…</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Created {formatDate(current.createdAt)}
                {current.lastUsedAt
                  ? ` · Last used ${formatDate(current.lastUsedAt)}`
                  : " · Not used yet"}
              </p>
              {active.length > 1 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {active.length - 1} older {active.length === 2 ? "token is" : "tokens are"} also
                  still active. Regenerating turns {active.length === 2 ? "it" : "them"} off.
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No capture token yet.</p>
          )}
        </div>
      )}

      {issued && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">Copy this token now</p>
          <p className="mt-1 text-xs text-muted-foreground">
            It will not be shown again. Paste it into each client that uses your manual token.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded bg-background p-2 text-xs">
              {issued.token}
            </code>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void copyToken()}
              aria-label="Copy token"
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

      {active && (
        <div className="mt-4">
          {confirming ? (
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm">
                Your current token stops working immediately. You will need to paste the new one
                into every client that uses your manual token. Paired devices stay connected.
              </p>
              <div className="mt-3 flex gap-2">
                <Button onClick={() => void generate()} disabled={busy}>
                  {busy ? "Regenerating…" : "Regenerate token"}
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : hasToken ? (
            <Button variant="outline" onClick={() => setConfirming(true)}>
              Regenerate…
            </Button>
          ) : (
            <Button onClick={() => void generate()} disabled={busy}>
              {busy ? "Generating…" : "Generate token"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
