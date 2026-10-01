"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Archive,
  FlaskConical,
  KeyRound,
  MailPlus,
  Sparkles,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TokenSettings } from "@/components/capture/token-settings";
import { CaptureDiagnostics } from "@/components/capture/capture-diagnostics";
import { InvitationsSettings } from "@/components/settings/invitations-settings";
import { KeyboardShortcutsCard } from "@/components/settings/keyboard-shortcuts-card";
import { useShortcut } from "@/components/shortcuts/shortcuts-provider";
import type { ShortcutDef } from "@/lib/shortcuts/types";

const CAPTURE_TAB: ShortcutDef = {
  id: "settings.tab.capture",
  keys: [{ key: "1" }],
  label: "Capture tab",
  group: "Settings",
  scope: "settings",
};
const ACCOUNT_TAB: ShortcutDef = {
  id: "settings.tab.account",
  keys: [{ key: "2" }],
  label: "Account tab",
  group: "Settings",
  scope: "settings",
};

/** Failures the Troubleshooting badge counts; mirrors the diagnostics panel's query. */
const FAILURES_QUERY = "/api/v1/captures?status=rejected,failed&limit=25";

/**
 * Whether the signed-in account is an administrator. Server-derived (`isAdmin` on the
 * account payload); the admin APIs enforce the same allowlist, so this only decides
 * which tabs to show. Any failure means "not an admin".
 */
function useAdminState() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [failureCount, setFailureCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const account = await fetch("/api/v1/account", { headers: { Accept: "application/json" } });
        if (!account.ok) return;
        const payload = (await account.json()) as { account?: { isAdmin?: boolean } };
        if (cancelled || payload.account?.isAdmin !== true) return;
        setIsAdmin(true);
        const failures = await fetch(FAILURES_QUERY, { headers: { Accept: "application/json" } });
        if (!failures.ok) return;
        const body = (await failures.json()) as { receipts?: unknown[] };
        if (!cancelled) setFailureCount(body.receipts?.length ?? 0);
      } catch {
        // Stay a plain member view.
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { isAdmin, failureCount };
}

/**
 * Settings keeps only what the hosted product uses: capture tokens and a
 * pointer to the account centre. Legacy connector, agent, topic and email
 * preference tabs were removed from this page in the 2026-09 UI simplification
 * (their routes and APIs still exist, unlinked).
 */
export default function SettingsPage() {
  const [tab, setTab] = useState("capture");
  const { isAdmin, failureCount } = useAdminState();
  useShortcut(CAPTURE_TAB, () => setTab("capture"));
  useShortcut(ACCOUNT_TAB, () => setTab("account"));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure your Distil preferences</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger
            value="capture"
            className="gap-1.5"
            aria-keyshortcuts="1"
            title="Capture (1)"
          >
            <KeyRound className="h-3.5 w-3.5" /> Capture
          </TabsTrigger>
          <TabsTrigger
            value="account"
            className="gap-1.5"
            aria-keyshortcuts="2"
            title="Account (2)"
          >
            <UserRound className="h-3.5 w-3.5" /> Account
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="invitations" className="gap-1.5">
              <MailPlus className="h-3.5 w-3.5" /> Invitations
            </TabsTrigger>
          )}
          {isAdmin && (
            <TabsTrigger value="troubleshooting" className="gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5" /> Troubleshooting
              {failureCount > 0 && (
                <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                  {failureCount}
                  <span className="sr-only"> failed captures</span>
                </Badge>
              )}
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="capture" className="mt-4 space-y-4">
          <TokenSettings />
        </TabsContent>

        {isAdmin && (
          <TabsContent value="invitations" className="mt-4">
            <InvitationsSettings />
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="troubleshooting" className="mt-4 space-y-4">
            <CaptureDiagnostics />
          </TabsContent>
        )}

        <TabsContent value="account" className="mt-4 space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Account</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Profile, privacy, devices and data export or deletion live in the account centre.
              </p>
            </div>
            <Button asChild variant="outline" className="min-h-11">
              <Link href="/account">Open account centre</Link>
            </Button>
          </div>

          <KeyboardShortcutsCard />

          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">Library</h3>
            <p className="text-xs text-muted-foreground">
              Quieter surfaces that are not in the main navigation.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm" className="min-h-9 gap-1.5">
                <Link href="/digests">
                  <Sparkles className="h-3.5 w-3.5" /> Digests
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="min-h-9 gap-1.5">
                <Link href="/archive">
                  <Archive className="h-3.5 w-3.5" /> Archive
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="min-h-9 gap-1.5">
                <Link href="/research">
                  <FlaskConical className="h-3.5 w-3.5" /> Research
                </Link>
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
