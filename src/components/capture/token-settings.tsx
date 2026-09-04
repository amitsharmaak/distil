"use client";

import { useEffect, useState } from "react";
import { Check, Copy, KeyRound, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CaptureTokenSummary {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

interface IssuedToken extends CaptureTokenSummary {
  token: string;
}

export function TokenSettings() {
  const [tokens, setTokens] = useState<CaptureTokenSummary[]>([]);
  const [issued, setIssued] = useState<IssuedToken>();
  const [name, setName] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadTokens() {
    const response = await fetch("/api/v1/capture-tokens", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Could not load capture tokens.");
    const payload = (await response.json()) as { tokens: CaptureTokenSummary[] };
    setTokens(payload.tokens.filter((token) => !token.revokedAt));
  }

  useEffect(() => {
    void loadTokens().catch((caught) => setError(caught.message));
  }, []);

  async function createToken(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/v1/capture-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as {
        token?: IssuedToken;
        error?: { message?: string };
      };
      if (!response.ok || !payload.token)
        throw new Error(payload.error?.message ?? "Could not create token.");
      setIssued(payload.token);
      setName("");
      await loadTokens();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create token.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    setError(undefined);
    const response = await fetch(`/api/v1/capture-tokens/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      setError("Could not revoke this token.");
      return;
    }
    setTokens((current) => current.filter((token) => token.id !== id));
  }

  async function copyToken() {
    if (!issued) return;
    await navigator.clipboard.writeText(issued.token);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Capture tokens</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Use separate tokens for your iPhone Shortcut and browser extension.
          </p>
        </div>
      </div>
      <form onSubmit={createToken} className="mt-5 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="token-name" className="sr-only">
          Token name
        </label>
        <Input
          id="token-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. iPhone Shortcut"
          maxLength={80}
          required
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create token"}
        </Button>
      </form>
      {issued && (
        <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-medium">Copy this token now</p>
          <p className="mt-1 text-xs text-muted-foreground">
            For security, it will not be shown again.
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
      <div className="mt-5 space-y-2">
        {tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active capture tokens.</p>
        ) : (
          tokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{token.name}</p>
                <p className="text-xs text-muted-foreground">
                  {token.tokenPrefix}… · Created {new Date(token.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void revoke(token.id)}
                aria-label={`Revoke ${token.name}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
