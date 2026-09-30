import type { Metadata } from "next";

import { ExtensionConnect } from "@/components/extension/extension-connect";

export const metadata: Metadata = {
  title: "Connect your browser · Distil",
  robots: { index: false, follow: false },
};

/**
 * Public path (the signed-out view hosts the sign-in card), but it only ever acts on behalf of a
 * signed-in session, and only when the extension that opened it supplies a `state` nonce.
 */
export default async function ExtensionConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { state } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <meta content="no-referrer" name="referrer" />
      <ExtensionConnect state={typeof state === "string" ? state : undefined} />
    </main>
  );
}
