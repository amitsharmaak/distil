"use client";

import { useEffect, useState } from "react";

import { SignInCard } from "@/components/auth/sign-in-card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { describeBrowser } from "@/lib/extension/browser-label";
import {
  DISTIL_EXTENSION_INSTALL_URL,
  EXTENSION_CONNECT_PATH,
  EXTENSION_STATE_PATTERN,
} from "@/lib/extension/constants";
import { extensionMessagingAvailable, sendConnectMessage } from "@/lib/extension/handoff";

type Phase =
  | { name: "checking" }
  | { name: "signed-out" }
  | { name: "denied" }
  | { name: "ready"; email?: string }
  | { name: "connecting"; email?: string }
  | { name: "done" }
  | { name: "no-extension" }
  | { name: "rejected" }
  | { name: "error" };

interface IssuedConnection {
  connection: { id: string; label: string; createdAt: string; accountId: string };
  token: string;
}

/**
 * Connects one browser extension to the signed-in account. The token is minted on the Connect
 * click, handed straight to the extension and never rendered, so nobody copies or pastes it.
 */
export function ExtensionConnect({ state }: { state?: string }) {
  const validState = state !== undefined && EXTENSION_STATE_PATTERN.test(state) ? state : undefined;
  const [phase, setPhase] = useState<Phase>({ name: "checking" });

  useEffect(() => {
    if (!validState) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/v1/account", {
          headers: { Accept: "application/json" },
        });
        if (cancelled) return;
        if (response.status === 401) return setPhase({ name: "signed-out" });
        if (response.status === 403) return setPhase({ name: "denied" });
        if (!response.ok) return setPhase({ name: "error" });
        const payload = (await response.json()) as { account?: { email?: string } };
        if (!extensionMessagingAvailable()) return setPhase({ name: "no-extension" });
        setPhase({ name: "ready", email: payload.account?.email });
      } catch {
        if (!cancelled) setPhase({ name: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [validState]);

  async function connect() {
    if (!validState || phase.name !== "ready") return;
    const email = phase.email;
    setPhase({ name: "connecting", email });
    let issued: IssuedConnection | undefined;
    try {
      const response = await fetch("/api/v1/extension/connections", {
        method: "POST",
        headers: { "content-type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ label: describeBrowser(navigator.userAgent) }),
      });
      if (!response.ok) return setPhase({ name: "error" });
      issued = (await response.json()) as IssuedConnection;
    } catch {
      return setPhase({ name: "error" });
    }
    const result = await sendConnectMessage({
      state: validState,
      origin: window.location.origin,
      token: issued.token,
      connection: issued.connection,
      accountEmail: email,
    });
    if (result === "accepted") return setPhase({ name: "done" });
    // The extension never took the token, so turn the orphaned connection off again.
    await fetch(`/api/v1/extension/connections/${encodeURIComponent(issued.connection.id)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    setPhase(result === "unreachable" ? { name: "no-extension" } : { name: "rejected" });
  }

  if (!validState) {
    return (
      <Message title="Start from the extension">
        Open the Distil extension in your browser and choose Sign in to Distil. It opens this page
        with the details it needs.
      </Message>
    );
  }

  switch (phase.name) {
    case "checking":
      return (
        <div role="status" aria-label="Checking your session" className="space-y-4">
          <PageHeader title="Connect your browser" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-11 w-28" />
        </div>
      );
    case "signed-out":
      return (
        <SignInCard next={`${EXTENSION_CONNECT_PATH}?state=${encodeURIComponent(validState)}`} />
      );
    case "denied":
      return (
        <Message title="This account cannot connect a browser">
          Your session does not have an active Distil account. Sign in with a different account or
          ask the operator who invited you.
        </Message>
      );
    case "no-extension":
      return (
        <Message title="Install the Distil extension first">
          This page could not reach the Distil extension. Install or enable it, then choose Sign in
          to Distil from the extension again.
          <a className="mt-3 block text-sm underline" href={DISTIL_EXTENSION_INSTALL_URL}>
            Get the Distil extension
          </a>
        </Message>
      );
    case "rejected":
      return (
        <Message title="The extension did not accept the connection">
          The request may have expired. Close this tab and choose Sign in to Distil from the
          extension again.
        </Message>
      );
    case "error":
      return (
        <Message title="Something went wrong">
          We could not finish connecting this browser. Close this tab and try again from the
          extension.
        </Message>
      );
    case "done":
      return (
        <Message title="Connected">
          This browser can now save to Distil. You can close this tab.
        </Message>
      );
    case "ready":
    case "connecting":
      return (
        <>
          <PageHeader
            title="Connect this browser to Distil?"
            description={
              <>
                {phase.email ? `Signed in as ${phase.email}. ` : ""}
                Pages you save from this browser will go to your Distil account. You can disconnect
                it any time in Settings.
              </>
            }
          />
          <Button
            className="min-h-11"
            disabled={phase.name === "connecting"}
            onClick={() => void connect()}
          >
            {phase.name === "connecting" ? "Connecting…" : "Connect"}
          </Button>
        </>
      );
  }
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div role="status">
      <PageHeader title={title} description={children} />
    </div>
  );
}
