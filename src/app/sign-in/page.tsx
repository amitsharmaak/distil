import { SignInCard } from "@/components/auth/sign-in-card";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <meta content="no-referrer" name="referrer" />
      <SignInCard />
    </main>
  );
}
