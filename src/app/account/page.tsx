import { AccountCenter } from "@/components/account/account-center";

export default function AccountPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your profile, privacy, devices, capture tokens, and data.
        </p>
      </div>
      <AccountCenter />
    </main>
  );
}
