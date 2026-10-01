"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiBaseUrl, iosShortcutUrl } from "@/lib/public-config";

interface PhoneSummary {
  id: string;
  kind: "manual" | "browser" | "phone";
  label?: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

interface PairingCode {
  code: string;
  expiresAt: string;
  previousDeviceIds: string[];
}

interface ConnectionState {
  devices?: PhoneSummary[];
  pairing?: PairingCode;
  paired: boolean;
}

const formatDate = (value: string) => new Date(value).toLocaleDateString();
const lastUsed = (value: string) =>
  new Date(value).toDateString() === new Date().toDateString() ? "today" : formatDate(value);

/** Pairs the Shortcut with a temporary code; the phone credential never reaches this card. */
export function IphoneShortcutCard() {
  const [{ devices, pairing, paired }, setConnections] = useState<ConnectionState>({
    paired: false,
  });
  const [now, setNow] = useState(() => Date.now());
  const [generating, setGenerating] = useState(false);
  const [disconnecting, setDisconnecting] = useState<string>();
  const [loadError, setLoadError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const listRequest = useRef<AbortController | null>(null);
  const pairingRequest = useRef<AbortController | null>(null);
  const disconnectRequest = useRef<AbortController | null>(null);

  const loadDevices = useCallback(async () => {
    listRequest.current?.abort();
    const controller = new AbortController();
    listRequest.current = controller;
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/capture-tokens`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as { tokens: PhoneSummary[] };
      if (controller.signal.aborted) return;
      const phones = payload.tokens.filter((token) => token.kind === "phone" && !token.revokedAt);
      setConnections((current) => {
        const pending = current.pairing;
        const justPaired =
          pending && phones.some((phone) => !pending.previousDeviceIds.includes(phone.id));
        return justPaired ? { devices: phones, paired: true } : { ...current, devices: phones };
      });
      setLoadError(undefined);
    } catch {
      if (!controller.signal.aborted) setLoadError("Could not load your paired iPhones.");
    }
  }, []);

  useEffect(() => {
    void loadDevices();
    const refresh = () => {
      if (document.visibilityState === "hidden") return;
      setNow(Date.now());
      void loadDevices();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      listRequest.current?.abort();
      pairingRequest.current?.abort();
      disconnectRequest.current?.abort();
    };
  }, [loadDevices]);

  const secondsLeft = pairing
    ? Math.max(0, Math.ceil((Date.parse(pairing.expiresAt) - now) / 1_000))
    : 0;
  const active = Boolean(pairing && secondsLeft > 0);

  useEffect(() => {
    if (!active) return;
    const countdown = window.setInterval(() => setNow(Date.now()), 1_000);
    const polling = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void loadDevices();
    }, 5_000);
    return () => {
      window.clearInterval(countdown);
      window.clearInterval(polling);
      listRequest.current?.abort();
    };
  }, [active, pairing?.code, loadDevices]);

  async function createPairing() {
    pairingRequest.current?.abort();
    const controller = new AbortController();
    pairingRequest.current = controller;
    setGenerating(true);
    setActionError(undefined);
    // A request may replace the server's previous code even if its response is lost.
    setConnections((current) => ({ devices: current.devices, paired: false }));
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/shortcut-pairings`, {
        method: "POST",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error();
      const payload = (await response.json()) as { code: string; expiresAt: string };
      if (!payload.code || !Number.isFinite(Date.parse(payload.expiresAt))) throw new Error();
      if (controller.signal.aborted) return;
      setNow(Date.now());
      setConnections((current) => ({
        devices: current.devices,
        paired: false,
        pairing: { ...payload, previousDeviceIds: current.devices?.map((phone) => phone.id) ?? [] },
      }));
    } catch {
      if (!controller.signal.aborted) setActionError("Could not create a pairing code. Try again.");
    } finally {
      if (!controller.signal.aborted) setGenerating(false);
    }
  }

  async function disconnect(id: string) {
    const controller = new AbortController();
    disconnectRequest.current = controller;
    setDisconnecting(id);
    setActionError(undefined);
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/v1/capture-tokens/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          signal: controller.signal,
        }
      );
      if (!response.ok && response.status !== 404) throw new Error();
      if (controller.signal.aborted) return;
      listRequest.current?.abort();
      setConnections((current) => ({
        ...current,
        devices: current.devices?.filter((device) => device.id !== id),
        paired: false,
      }));
    } catch {
      if (!controller.signal.aborted)
        setActionError("Could not disconnect this iPhone. Try again.");
    } finally {
      if (!controller.signal.aborted) setDisconnecting(undefined);
    }
  }

  return (
    <section
      aria-labelledby="iphone-shortcut-title"
      className="rounded-xl border border-border bg-card p-5"
    >
      <div className="flex gap-3">
        <Smartphone aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0">
          <h3 id="iphone-shortcut-title" className="text-sm font-semibold">
            iPhone Shortcut
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Save to Distil from your iPhone’s Share Sheet. Install the Shortcut, then pair it with a
            one-time code.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {iosShortcutUrl && (
          <Button asChild variant="outline" className="min-h-11">
            <a href={iosShortcutUrl} target="_blank" rel="noopener noreferrer">
              Get the Shortcut
            </a>
          </Button>
        )}
        <Button
          className="min-h-11"
          onClick={() => void createPairing()}
          disabled={generating || !devices}
        >
          {generating ? "Generating code…" : pairing ? "Get a new code" : "Pair this iPhone"}
        </Button>
      </div>

      {pairing && (
        <div className="mt-4 rounded-lg border border-border p-4">
          {active ? (
            <>
              <p className="text-sm">Enter this code when the Shortcut asks to pair.</p>
              <p
                className="mt-3 font-mono text-2xl font-semibold tracking-widest"
                aria-label={`Pairing code ${pairing.code}`}
              >
                {pairing.code}
              </p>
              <p role="timer" aria-live="off" className="mt-2 text-xs text-muted-foreground">
                Expires in {Math.floor(secondsLeft / 60)}:
                {String(secondsLeft % 60).padStart(2, "0")}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Open a link’s Share Sheet and run Save to Distil. A new code replaces this one.
              </p>
            </>
          ) : (
            <p role="status" className="text-sm">
              This code has expired. Get a new code to pair your iPhone.
            </p>
          )}
        </div>
      )}

      {paired && (
        <p role="status" className="mt-4 text-sm">
          iPhone connected. You can now save from the Share Sheet.
        </p>
      )}

      {!devices && !loadError && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Loading paired iPhones…
        </p>
      )}
      {devices?.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No iPhones paired yet.</p>
      )}
      {devices && devices.length > 0 && (
        <ul aria-label="Paired iPhones" className="mt-4 space-y-2">
          {devices.map((device) => (
            <li
              key={device.id}
              className="flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="break-words text-sm font-medium">{device.label || "iPhone"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Paired {formatDate(device.createdAt)}
                  {device.lastUsedAt
                    ? ` · Last used ${lastUsed(device.lastUsedAt)}`
                    : " · Not used yet"}
                </p>
              </div>
              <Button
                variant="outline"
                className="min-h-11 self-start"
                aria-label={`Disconnect ${device.label || "iPhone"}`}
                disabled={Boolean(disconnecting)}
                onClick={() => void disconnect(device.id)}
              >
                {disconnecting === device.id ? "Disconnecting…" : "Disconnect"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {loadError && (
        <div className="mt-3">
          <p role="alert" className="text-sm text-destructive">
            {loadError}
          </p>
          <Button variant="link" onClick={() => void loadDevices()}>
            Retry loading iPhones
          </Button>
        </div>
      )}
      {actionError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {actionError}
        </p>
      )}
    </section>
  );
}
