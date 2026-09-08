import { AccountCenter } from "@/components/account/account-center";

export default function OnboardingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-10">
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Welcome to Distil</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A few details make your first daily brief feel like it belongs to you.
        </p>
      </div>
      <AccountCenter onboarding />
    </main>
  );
}
