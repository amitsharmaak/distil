"use client";

import Link from "next/link";
import { Archive, Folder, KeyRound, Sparkles, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TokenSettings } from "@/components/capture/token-settings";

/**
 * Settings keeps only what the hosted product uses: capture tokens and a
 * pointer to the account centre. Legacy connector, agent, topic and email
 * preference tabs were removed from this page in the 2026-09 UI simplification
 * (their routes and APIs still exist, unlinked).
 */
export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Configure your Distil preferences</p>
      </div>

      <Tabs defaultValue="capture">
        <TabsList>
          <TabsTrigger value="capture" className="gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> Capture
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-1.5">
            <UserRound className="h-3.5 w-3.5" /> Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="capture" className="mt-4 space-y-4">
          <TokenSettings />
        </TabsContent>

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
                <Link href="/collections">
                  <Folder className="h-3.5 w-3.5" /> Collections
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="min-h-9 gap-1.5">
                <Link href="/archive">
                  <Archive className="h-3.5 w-3.5" /> Archive
                </Link>
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
