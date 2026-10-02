"use client";

import { formatDate } from "@/lib/format";
import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BrowserConnection {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt?: string;
}

/** Lists browsers connected through the extension's sign-in flow and disconnects them one by one. */
export function ConnectedBrowsers() {
  const [connections, setConnections] = useState<BrowserConnection[]>();
  const [error, setError] = useState<string>();
  const [busyId, setBusyId] = useState<string>();

  async function load() {
    const response = await fetch("/api/v1/extension/connections", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Could not load your connected browsers.");
    const payload = (await response.json()) as { connections: BrowserConnection[] };
    setConnections(payload.connections);
  }

  useEffect(() => {
    void load().catch((caught: Error) => setError(caught.message));
  }, []);

  async function disconnect(id: string) {
    setBusyId(id);
    setError(undefined);
    try {
      const response = await fetch(`/api/v1/extension/connections/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 404) throw new Error("Could not disconnect.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect.");
    } finally {
      setBusyId(undefined);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex gap-3">
        <Globe className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Connected browsers</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Browsers where you signed in through the Distil extension. Disconnecting one stops it
            from saving until you sign in again from its extension.
          </p>
        </div>
      </div>

      {connections && connections.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No browsers connected yet.</p>
      )}

      {connections && connections.length > 0 && (
        <ul className="mt-4 space-y-2">
          {connections.map((connection) => (
            <li
              key={connection.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{connection.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Connected {formatDate(connection.createdAt)}
                  {connection.lastUsedAt
                    ? ` · Last used ${formatDate(connection.lastUsedAt)}`
                    : " · Not used yet"}
                </p>
              </div>
              <Button
                className="min-h-11 min-w-11"
                variant="outline"
                size="sm"
                disabled={busyId === connection.id}
                onClick={() => void disconnect(connection.id)}
                aria-label={`Disconnect ${connection.label}`}
              >
                {busyId === connection.id ? "Disconnecting…" : "Disconnect"}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
