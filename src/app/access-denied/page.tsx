import Link from "next/link";

export default function AccessDeniedPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold">Unable to continue</h1>
      <p className="text-sm text-muted-foreground">
        This signed-in identity does not have access to an active Distil account. Ask the operator
        who invited you to issue a new invitation, then use the same verified email address.
      </p>
      <Link className="text-sm underline" href="/invite">
        Return to invitation sign-in
      </Link>
    </main>
  );
}
